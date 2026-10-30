/** Authentication and first-tenant onboarding. */
function registerTenant_(input) {
  const name = safeText_(input.businessName, 100);
  const email = normalizeEmail_(input.email);
  const password = String(input.password || "");
  if (name.length < 2) throw new Error("BUSINESS_NAME_REQUIRED");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("INVALID_EMAIL");
  if (password.length < 12 || password.length > 128) throw new Error("PASSWORD_MUST_BE_12_TO_128_CHARS");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error("PLEASE_RETRY");
  try {
    if (findUserByEmail_(email)) throw new Error("ACCOUNT_ALREADY_EXISTS");
    const now = nowIso_();
    const tenantId = newId_();
    const userId = newId_();
    const slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48) + "-" + tenantId.slice(0,6);
    const hashed = passwordHash_(password);
    appendObject_("Tenants", {
      tenantId:tenantId,name:name,slug:slug,status:"trial",planId:"trial",
      trialEndsAt:new Date(Date.now()+7*86400000).toISOString(),
      timezone:"America/Sao_Paulo",currency:"BRL",createdAt:now,updatedAt:now
    });
    appendObject_("Users", {
      userId:userId,tenantId:tenantId,email:email,passwordHash:hashed.hash,passwordSalt:hashed.salt,
      role:"owner",status:"active",createdAt:now,updatedAt:now,lastLoginAt:now
    });
    writeAudit_(tenantId,userId,"tenant.registered","tenant",tenantId);
    const session = issueToken_({userId:userId,tenantId:tenantId,role:"owner"});
    return {user:{userId:userId,tenantId:tenantId,email:email,role:"owner"},session:session};
  } finally { lock.releaseLock(); }
}
function login_(input) {
  const email = normalizeEmail_(input.email);
  const password = String(input.password || "");
  if (!email || !password || password.length > 128) throw new Error("INVALID_CREDENTIALS");
  const user = findUserByEmail_(email);
  if (!user || user.status !== "active") throw new Error("INVALID_CREDENTIALS");
  const derived = passwordHash_(password, String(user.passwordSalt));
  if (!constantTimeEqual_(derived.hash, String(user.passwordHash))) throw new Error("INVALID_CREDENTIALS");
  const now = nowIso_();
  updateUserLogin_(user.userId, now);
  writeAudit_(user.tenantId,user.userId,"auth.login","user",user.userId);
  const session = issueToken_({userId:user.userId,tenantId:user.tenantId,role:user.role});
  return {user:{userId:user.userId,tenantId:user.tenantId,email:user.email,role:user.role},session:session};
}
function updateUserLogin_(userId, timestamp) {
  const sheet = sheet_("Users");
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(String);
  const idCol = headers.indexOf("userId");
  const loginCol = headers.indexOf("lastLoginAt");
  const updateCol = headers.indexOf("updatedAt");
  for (let r=1;r<values.length;r++) if (String(values[r][idCol])===String(userId)) {
    sheet.getRange(r+1,loginCol+1).setValue(timestamp);
    sheet.getRange(r+1,updateCol+1).setValue(timestamp);
    return;
  }
  throw new Error("USER_NOT_FOUND");
}
function currentUser_(token) {
  const claims = verifyToken_(token);
  const user = findUserById_(claims.sub);
  if (!user || user.status !== "active" || String(user.tenantId)!==String(claims.tid)) throw new Error("INVALID_SESSION");
  return {userId:user.userId,tenantId:user.tenantId,email:user.email,role:user.role};
}
function logout_(token) {
  const claims = verifyToken_(token);
  appendObject_("RevokedTokens", {
    tokenId:claims.jti,tenantId:claims.tid,userId:claims.sub,
    revokedAt:nowIso_(),expiresAt:new Date(claims.exp*1000).toISOString()
  });
  writeAudit_(claims.tid,claims.sub,"auth.logout","session",claims.jti);
  return {loggedOut:true};
}
