/**
 * Smart Schedule Builder — umumiy saqlash (Google Apps Script)
 * O‘rnatish (5 daqiqa):
 *  1) https://script.google.com → "New project" → shu kodni to‘liq joylashtiring → Save.
 *  2) Deploy → New deployment → turi: "Web app"
 *     Execute as: Me   ·   Who has access: Anyone   → Deploy → ruxsat bering.
 *  3) Chiqqan "Web app URL" ni ilovadagi Sozlamalar → "Umumiy saqlash" ga joylang va administrator parolini o‘rnating.
 * Ma'lumot sizning Google Drive'ingizda "darsreja-data.json" faylida turadi. Har kuni avtomatik zaxira nusxa olinadi.
 * Kodni o‘zgartirsangiz: Deploy → Manage deployments → ✏️ → Version: New version → Deploy (URL o‘zgarmaydi).
 */
var FILE_NAME = 'darsreja-data.json';
var MAX_FAILS = 10;          // shuncha xato paroldan keyin…
var LOCK_SECONDS = 600;      // …10 daqiqa bloklanadi
var KEEP_BACKUPS = 30;       // kunlik zaxira nusxalar soni

function doGet(e) {
  var p = PropertiesService.getScriptProperties();
  return out_({ ok: true, app: 'darsreja', ready: !!p.getProperty('ADMIN_HASH'), version: Number(p.getProperty('VERSION') || 0) });
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (x) { return out_({ ok: false, error: 'bad_request' }); }
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return out_(handle_(req || {})); }
  catch (err) { return out_({ ok: false, error: 'server', message: String(err && err.message || err) }); }
  finally { lock.releaseLock(); }
}

function handle_(req) {
  var p = PropertiesService.getScriptProperties();
  if (req.action === 'setup') {
    if (p.getProperty('ADMIN_HASH')) return { ok: false, error: 'already_setup' };
    if (!req.password || String(req.password).length < 4) return { ok: false, error: 'weak_password' };
    p.setProperty('SALT', Utilities.getUuid());
    p.setProperty('ADMIN_HASH', hash_(req.password));
    p.setProperty('VERSION', '0');
    return { ok: true, role: 'admin', version: 0, teachersWithPassword: [], viewer: false };
  }
  if (!p.getProperty('ADMIN_HASH')) return { ok: false, error: 'not_setup' };
  if (isLocked_()) return { ok: false, error: 'locked' };
  var who = auth_(req.password);
  if (!who) { fail_(); return { ok: false, error: 'wrong_password' }; }
  clearFails_();
  var version = Number(p.getProperty('VERSION') || 0);
  var info = function () {
    var r = { ok: true, role: who.role, teacherId: who.teacherId || null, version: version, savedAt: p.getProperty('SAVED_AT') || null };
    if (who.role === 'admin') { r.teachersWithPassword = teacherIds_(); r.viewer = !!p.getProperty('VIEW_HASH'); }
    return r;
  };
  switch (req.action) {
    case 'login': return info();
    case 'version': return { ok: true, version: version, savedAt: p.getProperty('SAVED_AT') || null };
    case 'load': { var r = info(); r.data = readData_(); return r; }
    case 'save': {
      if (who.role !== 'admin') return { ok: false, error: 'forbidden' };
      if (req.baseVersion !== undefined && req.baseVersion !== null && Number(req.baseVersion) !== version && !req.force) return { ok: false, error: 'conflict', version: version };
      if (!req.data || typeof req.data !== 'object') return { ok: false, error: 'bad_data' };
      writeData_(req.data);
      version += 1;
      p.setProperty('VERSION', String(version));
      p.setProperty('SAVED_AT', new Date().toISOString());
      return { ok: true, version: version, savedAt: p.getProperty('SAVED_AT') };
    }
    case 'setAdminPassword': {
      if (who.role !== 'admin') return { ok: false, error: 'forbidden' };
      if (!req.newPassword || String(req.newPassword).length < 4) return { ok: false, error: 'weak_password' };
      p.setProperty('ADMIN_HASH', hash_(req.newPassword));
      return { ok: true };
    }
    case 'setViewerPassword': {
      if (who.role !== 'admin') return { ok: false, error: 'forbidden' };
      if (req.newPassword) p.setProperty('VIEW_HASH', hash_(req.newPassword)); else p.deleteProperty('VIEW_HASH');
      return { ok: true };
    }
    case 'setTeacherPasswords': {
      if (who.role !== 'admin') return { ok: false, error: 'forbidden' };
      var map = req.passwords || {};
      for (var id in map) {
        if (!/^[A-Za-z0-9_\-]{1,80}$/.test(id)) continue;
        if (map[id]) p.setProperty('T_' + id, hash_(map[id])); else p.deleteProperty('T_' + id);
      }
      return { ok: true, teachersWithPassword: teacherIds_() };
    }
  }
  return { ok: false, error: 'unknown_action' };
}

function auth_(pw) {
  if (!pw) return null;
  var p = PropertiesService.getScriptProperties();
  var h = hash_(pw);
  if (h === p.getProperty('ADMIN_HASH')) return { role: 'admin' };
  var all = p.getProperties();
  for (var k in all) if (k.indexOf('T_') === 0 && all[k] === h) return { role: 'teacher', teacherId: k.slice(2) };
  if (all.VIEW_HASH && all.VIEW_HASH === h) return { role: 'viewer' };
  return null;
}

function teacherIds_() {
  var all = PropertiesService.getScriptProperties().getProperties();
  var ids = [];
  for (var k in all) if (k.indexOf('T_') === 0) ids.push(k.slice(2));
  return ids;
}

function hash_(pw) {
  var salt = PropertiesService.getScriptProperties().getProperty('SALT') || '';
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + String(pw), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}

function isLocked_() { return Number(CacheService.getScriptCache().get('fails') || 0) >= MAX_FAILS; }
function fail_() { var c = CacheService.getScriptCache(); c.put('fails', String(Number(c.get('fails') || 0) + 1), LOCK_SECONDS); }
function clearFails_() { CacheService.getScriptCache().remove('fails'); }

function file_() {
  var p = PropertiesService.getScriptProperties();
  var id = p.getProperty('FILE_ID');
  if (id) { try { return DriveApp.getFileById(id); } catch (x) { /* o‘chirilgan bo‘lsa — yangisi */ } }
  var f = DriveApp.createFile(FILE_NAME, '{}', 'application/json');
  p.setProperty('FILE_ID', f.getId());
  return f;
}

function readData_() {
  var txt = file_().getBlob().getDataAsString('UTF-8');
  try { var d = JSON.parse(txt); return d && Object.keys(d).length ? d : null; } catch (x) { return null; }
}

function writeData_(data) {
  var p = PropertiesService.getScriptProperties();
  var f = file_();
  var today = Utilities.formatDate(new Date(), 'Asia/Tashkent', 'yyyy-MM-dd');
  if (p.getProperty('BACKUP_DAY') !== today && Number(p.getProperty('VERSION') || 0) > 0) {
    // kunlik zaxira: kunning birinchi saqlashidan oldingi holat
    var copy = f.makeCopy('darsreja-zaxira-' + today + '.json');
    p.setProperty('BACKUP_DAY', today);
    var list = JSON.parse(p.getProperty('BACKUPS') || '[]');
    list.push(copy.getId());
    while (list.length > KEEP_BACKUPS) { try { DriveApp.getFileById(list.shift()).setTrashed(true); } catch (x) {} }
    p.setProperty('BACKUPS', JSON.stringify(list));
  }
  f.setContent(JSON.stringify(data));
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
