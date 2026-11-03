const PROJECT_ID = "gen-lang-client-0623364466";
const ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

export const encodeValue = (value) => {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new TypeError("Invalid Firestore timestamp.");
    return { timestampValue: value.toISOString() };
  }
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === "number") return { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (value && typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k,v]) => [k,encodeValue(v)])) } };
  throw new TypeError("Unsupported Firestore value.");
};

export const decodeValue = (value) => {
  if (!value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k,v]) => [k,decodeValue(v)]));
  if ("referenceValue" in value) return value.referenceValue;
  if ("geoPointValue" in value) return value.geoPointValue;
  return null;
};

export const decodeDocument = (document) => ({
  name: document.name,
  id: document.name?.split("/").pop(),
  fields: Object.fromEntries(Object.entries(document.fields || {}).map(([k,v]) => [k,decodeValue(v)])),
  createTime: document.createTime,
  updateTime: document.updateTime
});

export function createFirestoreRest({ getAccessToken, fetchImpl = fetch }) {
  async function request(path, body) {
    const token = await getAccessToken();
    const endpoint = path.startsWith("https://") ? path : `${ROOT}${path}`;
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error?.message || "Firestore REST request failed.");
      error.status = response.status;
      error.firestoreStatus = payload.error?.status;
      throw error;
    }
    return payload;
  }

  return {
    async begin() {
      const result = await request(":beginTransaction", { options: { readWrite: {} } });
      if (!result.transaction) throw new Error("Firestore did not return a transaction ID.");
      return new FirestoreRestTransaction(request, result.transaction);
    }
  };
}

export class FirestoreRestTransaction {
  constructor(request, transactionId) {
    this.request = request;
    this.transactionId = transactionId;
    this.writes = [];
    this.writeStarted = false;
    this.finished = false;
  }
  assertReadable() {
    if (this.finished) throw new Error("Transaction already finished.");
    if (this.writeStarted) throw new Error("Firestore transactions require all reads before writes.");
  }
  assertWritable() {
    if (this.finished) throw new Error("Transaction already finished.");
    this.writeStarted = true;
  }
  async get(documentPath) {
    this.assertReadable();
    const fullName = documentPath.startsWith("projects/") ? documentPath : `${ROOT}/${documentPath}`;
    const rows = await this.request(":batchGet", { documents: [fullName], transaction: this.transactionId });
    const row = rows.find((item) => item.found || item.missing);
    return row?.found ? { exists: true, ...decodeDocument(row.found) } : { exists: false, fields: {} };
  }
  async query(structuredQuery, parent = "") {
    this.assertReadable();
    const parentPath = parent ? (parent.startsWith("projects/") ? parent : `projects/${PROJECT_ID}/databases/(default)/documents/${parent}`) : `projects/${PROJECT_ID}/databases/(default)/documents`;
    const rows = await this.request(`https://firestore.googleapis.com/v1/${parentPath}:runQuery`, { structuredQuery, transaction: this.transactionId });
    return rows.map((row) => row.document).filter(Boolean).map(decodeDocument);
  }
  create(documentPath, fields) {
    this.assertWritable();
    const name = documentPath.startsWith("projects/") ? documentPath : `${ROOT}/${documentPath}`;
    this.writes.push({ update: { name, fields: Object.fromEntries(Object.entries(fields).map(([k,v]) => [k,encodeValue(v)])) }, currentDocument: { exists: false } });
    return this;
  }
  set(documentPath, fields, { merge = false } = {}) {
    this.assertWritable();
    const name = documentPath.startsWith("projects/") ? documentPath : `${ROOT}/${documentPath}`;
    const update = { name, fields: Object.fromEntries(Object.entries(fields).map(([k,v]) => [k,encodeValue(v)])) };
    this.writes.push({ update, ...(merge ? { updateMask: { fieldPaths: Object.keys(fields) } } : {}) });
    return this;
  }
  delete(documentPath) {
    this.assertWritable();
    const name = documentPath.startsWith("projects/") ? documentPath : `${ROOT}/${documentPath}`;
    this.writes.push({ delete: name });
    return this;
  }
  transform(documentPath, fields, timestampFields = []) {
    this.assertWritable();
    const name = documentPath.startsWith("projects/") ? documentPath : `${ROOT}/${documentPath}`;
    this.writes.push({
      update: { name, fields: Object.fromEntries(Object.entries(fields).map(([k,v]) => [k,encodeValue(v)])) },
      ...(timestampFields.length ? { updateTransforms: timestampFields.map(fieldPath => ({ fieldPath, setToServerValue: "REQUEST_TIME" })) } : {})
    });
    return this;
  }
  async commit() {
    if (this.finished) throw new Error("Transaction already finished.");
    this.finished = true;
    return this.request(":commit", { transaction: this.transactionId, writes: this.writes });
  }
  async rollback() {
    if (this.finished) return;
    this.finished = true;
    return this.request(":rollback", { transaction: this.transactionId }).catch(() => undefined);
  }
}
