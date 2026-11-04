import crypto from "node:crypto";
import { encodeValue, decodeValue } from "../src/firestore-rest.js";

const PROJECT_ID = "gen-lang-client-0623364466";
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;

export function setupMockBackend() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const keyId = "test-key-id-" + crypto.randomUUID();
  const jwk = publicKey.export({ format: "jwk" });
  jwk.kid = keyId;
  jwk.alg = "RS256";
  jwk.use = "sig";

  const store = new Map();
  const users = new Map();
  let transactionCounter = 1;
  const activeTransactions = new Map();

  function docPath(fullName) {
    return String(fullName || "")
      .replace(/^https?:\/\/[^/]+\/v1\//, "")
      .replace(/^projects\/[^/]+\/databases\/[^/]+\/documents\/?/, "")
      .replace(/^\/+/, "");
  }

  function createIdToken(payload = {}, options = {}) {
    const kid = options.kid !== undefined ? options.kid : keyId;
    const alg = options.alg !== undefined ? options.alg : "RS256";
    const header = Buffer.from(JSON.stringify({ alg, kid })).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      aud: PROJECT_ID,
      iss: ISSUER,
      sub: "default-user",
      email: "user@example.com",
      email_verified: true,
      iat: now,
      exp: now + 3600,
      auth_time: now,
      ...payload
    };
    const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const unsigned = header + "." + body;
    if (options.corruptSignature) {
      return unsigned + ".corrupted_signature_value";
    }
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(unsigned);
    const keyToUse = options.wrongKey ? crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey : privateKey;
    const signature = signer.sign(keyToUse).toString("base64url");
    return unsigned + "." + signature;
  }

  function registerUser(user) {
    users.set(user.uid, {
      localId: user.uid,
      email: user.email || "user@example.com",
      emailVerified: user.emailVerified !== false,
      displayName: user.displayName || "Test User",
      disabled: Boolean(user.disabled)
    });
  }

  function seedDocument(path, fields) {
    const clean = path.replace(/^\/+/, "");
    const now = new Date().toISOString();
    store.set(clean, {
      name: `projects/${PROJECT_ID}/databases/(default)/documents/${clean}`,
      fields,
      createTime: now,
      updateTime: now
    });
  }

  function getDocument(path) {
    const clean = path.replace(/^\/+/, "");
    return store.get(clean) || null;
  }

  function handleBatchGet(documents) {
    return documents.map((fullName) => {
      const path = docPath(fullName);
      const found = store.get(path);
      if (found) {
        return {
          found: {
            name: fullName,
            fields: Object.fromEntries(
              Object.entries(found.fields).map(([k, v]) => [k, encodeValue(v)])
            ),
            createTime: found.createTime,
            updateTime: found.updateTime
          }
        };
      }
      return { missing: fullName };
    });
  }

  function matchesFilter(fields, filter) {
    if (filter.compositeFilter) {
      const { op, filters = [] } = filter.compositeFilter;
      if (op === "AND") return filters.every((f) => matchesFilter(fields, f));
      if (op === "OR") return filters.some((f) => matchesFilter(fields, f));
      return true;
    }
    if (filter.fieldFilter) {
      const { field, op, value } = filter.fieldFilter;
      const docVal = fields[field.fieldPath];
      const targetVal = decodeValue(value);
      if (docVal === undefined) return false;
      if (op === "EQUAL") return docVal === targetVal;
      if (op === "GREATER_THAN_OR_EQUAL") {
        if (typeof docVal === "string" && typeof targetVal === "string") return docVal >= targetVal;
        if (docVal instanceof Date && typeof targetVal === "string") return docVal.toISOString() >= targetVal;
        return docVal >= targetVal;
      }
      if (op === "LESS_THAN") {
        if (typeof docVal === "string" && typeof targetVal === "string") return docVal < targetVal;
        if (docVal instanceof Date && typeof targetVal === "string") return docVal.toISOString() < targetVal;
        return docVal < targetVal;
      }
      if (op === "LESS_THAN_OR_EQUAL") {
        if (typeof docVal === "string" && typeof targetVal === "string") return docVal <= targetVal;
        if (docVal instanceof Date && typeof targetVal === "string") return docVal.toISOString() <= targetVal;
        return docVal <= targetVal;
      }
      return false;
    }
    return true;
  }

  function handleRunQuery(query, parent) {
    const from = query?.from?.[0] || {};
    const collectionId = from.collectionId;
    const allDescendants = Boolean(from.allDescendants);
    const parentClean = parent ? docPath(parent) : "";
    const results = [];

    for (const [docKey, docData] of store.entries()) {
      const parts = docKey.split("/");
      const lastCol = parts[parts.length - 2];
      if (lastCol !== collectionId) continue;
      if (!allDescendants && parentClean) {
        const expectedParent = parts.slice(0, -2).join("/");
        if (expectedParent !== parentClean) continue;
      }
      if (query.where && !matchesFilter(docData.fields, query.where)) continue;
      results.push(docData);
    }

    if (query.orderBy?.length) {
      const order = query.orderBy[0];
      const field = order.field?.fieldPath;
      const asc = order.direction !== "DESCENDING";
      results.sort((a, b) => {
        const vA = a.fields[field];
        const vB = b.fields[field];
        if (vA === vB) return 0;
        if (asc) return vA > vB ? 1 : -1;
        return vA < vB ? 1 : -1;
      });
    }

    if (query.limit && results.length > query.limit) {
      results.splice(query.limit);
    }

    return results.map((d) => ({
      document: {
        name: d.name,
        fields: Object.fromEntries(
          Object.entries(d.fields).map(([k, v]) => [k, encodeValue(v)])
        ),
        createTime: d.createTime,
        updateTime: d.updateTime
      }
    }));
  }

  function handleCommit(writes = []) {
    const now = new Date().toISOString();
    for (const write of writes) {
      if (write.delete) {
        const path = docPath(write.delete);
        store.delete(path);
      } else if (write.update) {
        const fullName = write.update.name;
        const path = docPath(fullName);
        const existing = store.get(path);
        if (write.currentDocument?.exists === false && existing) {
          const err = new Error("Document already exists: " + path);
          err.status = 409;
          err.firestoreStatus = "ALREADY_EXISTS";
          throw err;
        }
        if (write.currentDocument?.exists === true && !existing) {
          const err = new Error("Document does not exist: " + path);
          err.status = 404;
          err.firestoreStatus = "NOT_FOUND";
          throw err;
        }
        const decodedUpdate = Object.fromEntries(
          Object.entries(write.update.fields || {}).map(([k, v]) => [k, decodeValue(v)])
        );
        const updatedFields = write.updateMask?.fieldPaths
          ? { ...(existing?.fields || {}) }
          : { ...(existing?.fields || {}) };

        if (write.updateMask?.fieldPaths) {
          for (const k of write.updateMask.fieldPaths) {
            updatedFields[k] = decodedUpdate[k];
          }
        } else {
          Object.assign(updatedFields, decodedUpdate);
        }

        if (write.updateTransforms) {
          for (const transform of write.updateTransforms) {
            if (transform.setToServerValue === "REQUEST_TIME") {
              updatedFields[transform.fieldPath] = now;
            }
          }
        }

        store.set(path, {
          name: fullName,
          fields: updatedFields,
          createTime: existing?.createTime || now,
          updateTime: now
        });
      }
    }
    return { writeResults: writes.map(() => ({ updateTime: now })) };
  }

  async function mockFetch(url, init = {}) {
    const urlStr = String(url);

    if (urlStr.includes("jwk/securetoken@system.gserviceaccount.com")) {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    if (urlStr.includes("identitytoolkit.googleapis.com/v1/accounts:lookup")) {
      const body = JSON.parse(init.body || "{}");
      const parts = String(body.idToken || "").split(".");
      let sub = null;
      if (parts.length === 3) {
        try {
          const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
          sub = claims.sub;
        } catch {}
      }
      const user = sub ? users.get(sub) : null;
      if (!user) {
        return new Response(JSON.stringify({ error: { message: "USER_NOT_FOUND" } }), {
          status: 400,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ users: [user] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    if (urlStr.endsWith(":beginTransaction")) {
      const txId = "tx-" + transactionCounter++;
      activeTransactions.set(txId, { startedAt: Date.now() });
      return new Response(JSON.stringify({ transaction: txId }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    if (urlStr.endsWith(":batchGet")) {
      const body = JSON.parse(init.body || "{}");
      const result = handleBatchGet(body.documents || []);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    if (urlStr.endsWith(":runQuery") || urlStr.includes(":runQuery")) {
      const body = JSON.parse(init.body || "{}");
      const parentMatch = urlStr.match(/\/documents\/(.+):runQuery/);
      const parent = parentMatch ? parentMatch[1] : "";
      const result = handleRunQuery(body.structuredQuery || {}, parent);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    if (urlStr.endsWith(":commit")) {
      const body = JSON.parse(init.body || "{}");
      try {
        const result = handleCommit(body.writes || []);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({
          error: { message: err.message, status: err.firestoreStatus || "UNKNOWN" }
        }), {
          status: err.status || 400,
          headers: { "content-type": "application/json" }
        });
      }
    }

    if (urlStr.endsWith(":rollback")) {
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    if (urlStr.includes("databases/(default)/documents/")) {
      const docName = urlStr.replace(/^https:\/\/firestore\.googleapis\.com\/v1\/projects\/[^/]+\/databases\/[^/]+\/documents\/?/, "");
      const found = store.get(docName);
      if (!found) {
        return new Response(JSON.stringify({ error: { message: "NOT_FOUND", status: "NOT_FOUND" } }), {
          status: 404,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response(JSON.stringify({
        name: found.name,
        fields: Object.fromEntries(
          Object.entries(found.fields).map(([k, v]) => [k, encodeValue(v)])
        ),
        createTime: found.createTime,
        updateTime: found.updateTime
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: "Unhandled endpoint: " + urlStr }), {
      status: 404,
      headers: { "content-type": "application/json" }
    });
  }

  const env = {
    ALLOWED_ORIGINS: "https://preview.alansm-booking-preview.pages.dev",
    FIREBASE_WEB_API_KEY: "test-firebase-web-api-key",
    getGoogleAccessToken: async () => "mock-access-token"
  };

  return {
    createIdToken,
    registerUser,
    seedDocument,
    getDocument,
    mockFetch,
    env,
    store
  };
}
