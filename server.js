const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_FILE = path.join(ROOT, 'data', 'library.json');
const PORT = Number(process.env.PORT || 3000);

// Optional admin gate for the import endpoint (set ADMIN_TOKEN env to enable).
// When set, /import.html and POST /api/import require HTTP Basic auth (password = ADMIN_TOKEN).
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
function adminAuthorized(req) {
  if (!ADMIN_TOKEN) return true;
  const header = req.headers['authorization'] || '';
  const match = header.match(/^Basic\s+(.+)$/i);
  if (!match) return false;
  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    return decoded.endsWith(':' + ADMIN_TOKEN);
  } catch (e) {
    return false;
  }
}
const MAX_BODY = 30 * 1024 * 1024;

const TEXT = {
  body: '\u6b63\u6587',
  me: '\u6211',
  unnamedChapter: '\u672a\u547d\u540d\u7ae0\u8282',
  defaultPart: '\u7b2c1\u90e8',
  defaultSection: '\u7b2c1\u7bc7',
  anonymous: '\u8bfb\u8005'
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon'
};

function id(prefix) {
  return `${prefix}-${crypto.randomBytes(8).toString('hex')}`;
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

function json(res, status, value) {
  send(res, status, JSON.stringify(value), 'application/json; charset=utf-8');
}

function normalizeLibrary(library) {
  const now = new Date().toISOString();
  library.books = Array.isArray(library.books) ? library.books : [];
  library.books.forEach((book) => {
    book.author = book.author || TEXT.me;
    book.summary = book.summary || '';
    book.createdAt = book.createdAt || book.updatedAt || now;
    book.updatedAt = book.updatedAt || book.createdAt || now;
    book.chapters = Array.isArray(book.chapters) ? book.chapters : [];
    book.chapters.forEach((chapter, index) => {
      chapter.id = chapter.id || id('chapter');
      chapter.partTitle = chapter.partTitle || TEXT.defaultPart;
      chapter.sectionTitle = chapter.sectionTitle || TEXT.defaultSection;
      chapter.order = Number.isFinite(Number(chapter.order)) ? Number(chapter.order) : index + 1;
      chapter.title = chapter.title || TEXT.unnamedChapter;
      chapter.content = chapter.content || '';
      chapter.createdAt = chapter.createdAt || book.createdAt || now;
      chapter.updatedAt = chapter.updatedAt || book.updatedAt || chapter.createdAt || now;
      chapter.comments = Array.isArray(chapter.comments) ? chapter.comments : [];
      chapter.comments.forEach((comment) => {
        comment.id = comment.id || id('comment');
        comment.name = String(comment.name || '').trim() || TEXT.anonymous;
        comment.content = String(comment.content || '').trim();
        comment.viewerId = String(comment.viewerId || '').trim();
        comment.approved = comment.approved === true;
        comment.approvedAt = comment.approvedAt || null;
        comment.createdAt = comment.createdAt || new Date().toISOString();
      });
      chapter.comments = chapter.comments.filter((comment) => comment.content);
    });
    book.chapters.sort((a, b) => (a.order || 0) - (b.order || 0));
  });
  return library;
}

function libraryForViewer(library, viewerId) {
  const normalized = normalizeLibrary(JSON.parse(JSON.stringify(library || { books: [] })));
  const viewer = String(viewerId || '').trim();
  if (!viewer) return normalized;
  normalized.books.forEach((book) => {
    (book.chapters || []).forEach((chapter) => {
      chapter.comments = (chapter.comments || []).filter((comment) => comment.approved || (comment.viewerId && comment.viewerId === viewer));
    });
  });
  return normalized;
}

function bookForViewer(book, viewerId) {
  return libraryForViewer({ books: [book] }, viewerId).books[0];
}

function primaryBook(library) {
  return library.books?.[0] || null;
}

function nextChapterOrder(book) {
  return (book.chapters || []).reduce((max, chapter) => Math.max(max, Number(chapter.order) || 0), 0) + 1;
}

function makeChapter(payload, book) {
  const order = nextChapterOrder(book || { chapters: [] });
  const title = String(payload.chapterTitle || payload.title || '').trim();
  const now = new Date().toISOString();
  return {
    id: id('chapter'),
    partTitle: String(payload.partTitle || '').trim() || book?.chapters?.[book.chapters.length - 1]?.partTitle || TEXT.defaultPart,
    sectionTitle: String(payload.sectionTitle || '').trim() || book?.chapters?.[book.chapters.length - 1]?.sectionTitle || TEXT.defaultSection,
    order,
    title: title || `\u7b2c${order}\u7ae0`,
    content: String(payload.content || '').trim(),
    createdAt: now,
    updatedAt: now,
    comments: []
  };
}

async function readLibrary() {
  try {
    return normalizeLibrary(JSON.parse(await fs.readFile(DATA_FILE, 'utf8')));
  } catch (error) {
    return { books: [] };
  }
}

async function writeLibrary(library) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, `${JSON.stringify(normalizeLibrary(library), null, 2)}\n`, 'utf8');
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function splitChapters(text, splitMode = 'single') {
  const clean = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  if (splitMode !== 'auto') return [{ title: TEXT.body, content: clean }];
  const matches = [...clean.matchAll(/(^|\n)(#{1,3}\s*.+|\u7b2c[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07\u96f6\u3007\u4e240-9]+[\u7ae0\u8282\u56de\u5377\u90e8].*)/g)];
  if (matches.length <= 1) return [{ title: TEXT.body, content: clean }];
  return matches.map((match, index) => {
    const start = match.index + match[1].length;
    const end = matches[index + 1]?.index ?? clean.length;
    const block = clean.slice(start, end).trim();
    const [rawTitle, ...body] = block.split('\n');
    return { title: rawTitle.replace(/^#{1,3}\s*/, '').trim() || `\u7b2c ${index + 1} \u7ae0`, content: body.join('\n').trim() };
  }).filter((chapter) => chapter.title || chapter.content);
}

function formatContent(content) {
  const clean = String(content || '')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ')
    .split('\n')
    .map((line) => line.trim().replace(/[ ]{2,}/g, ' '))
    .filter(Boolean)
    .join('\n\n');
  if (!clean) return '';
  if (clean.includes('\n\n')) return clean.replace(/\n{3,}/g, '\n\n');
  const sentences = clean.match(/[^\u3002\uff01\uff1f!?]+[\u3002\uff01\uff1f!?\u300d\u300f\u201d\u2019]?/g);
  if (!sentences || sentences.length < 4) return clean;
  const paragraphs = [];
  let buffer = '';
  for (const sentence of sentences) {
    const next = buffer ? `${buffer}${sentence.trim()}` : sentence.trim();
    if (next.length >= 220) {
      paragraphs.push(next);
      buffer = '';
    } else {
      buffer = next;
    }
  }
  if (buffer) paragraphs.push(buffer);
  return paragraphs.join('\n\n');
}

async function handleImport(req, res) {
  try {
    const payload = JSON.parse(await collectBody(req));
    const title = String(payload.title || '').trim();
    const chapterTitle = String(payload.chapterTitle || payload.title || '').trim();
    const content = String(payload.content || '').trim();
    const library = await readLibrary();
    const existing = primaryBook(library);
    if (!chapterTitle || !content) return json(res, 400, { error: 'chapter title and content are required' });
    if (existing) {
      const now = new Date().toISOString();
      const chapter = makeChapter({ ...payload, chapterTitle, content }, existing);
      existing.chapters.push(chapter);
      existing.updatedAt = now;
      chapter.updatedAt = now;
      await writeLibrary(library);
      return json(res, 201, { ok: true, book: normalizeLibrary({ books: [existing] }).books[0], chapter });
    }
    if (!title) return json(res, 400, { error: 'book title is required' });
    const now = new Date().toISOString();
    const book = {
      id: id('book'),
      title,
      author: String(payload.author || '').trim() || TEXT.me,
      summary: String(payload.summary || '').trim(),
      createdAt: now,
      updatedAt: now,
      chapters: []
    };
    book.chapters.push(makeChapter({ ...payload, chapterTitle, content }, book));
    library.books.unshift(book);
    await writeLibrary(library);
    json(res, 201, { ok: true, book: normalizeLibrary({ books: [book] }).books[0], chapter: book.chapters[0] });
  } catch (error) {
    json(res, 500, { error: error.message || 'import failed' });
  }
}

async function handleUpdateBook(req, res, bookId) {
  const payload = JSON.parse(await collectBody(req));
  const library = await readLibrary();
  const book = library.books.find((item) => item.id === bookId);
  if (!book) return json(res, 404, { error: 'book not found' });
  if (payload.force !== true) return json(res, 403, { error: 'force edit is required' });
  const now = new Date().toISOString();
  book.title = String(payload.title || book.title || '').trim() || book.title;
  book.author = String(payload.author || '').trim() || TEXT.me;
  book.summary = String(payload.summary || '').trim();
  book.updatedAt = now;
  await writeLibrary(library);
  json(res, 200, { ok: true, book });
}

async function handleDeleteBook(res, bookId) {
  const library = await readLibrary();
  const before = library.books.length;
  library.books = library.books.filter((book) => book.id !== bookId);
  if (library.books.length === before) return json(res, 404, { error: 'book not found' });
  await writeLibrary(library);
  json(res, 200, { ok: true });
}

async function handleCreateChapter(req, res, bookId) {
  const payload = JSON.parse(await collectBody(req));
  const content = String(payload.content || '').trim();
  const title = String(payload.chapterTitle || payload.title || '').trim();
  if (!title || !content) return json(res, 400, { error: 'chapter title and content are required' });
  const library = await readLibrary();
  const book = library.books.find((item) => item.id === bookId);
  if (!book) return json(res, 404, { error: 'book not found' });
  book.chapters = Array.isArray(book.chapters) ? book.chapters : [];
  const now = new Date().toISOString();
  const chapter = makeChapter({ ...payload, title, content }, book);
  chapter.updatedAt = now;
  book.chapters.push(chapter);
  book.updatedAt = now;
  await writeLibrary(library);
  json(res, 201, { ok: true, book: normalizeLibrary({ books: [book] }).books[0], chapter });
}

async function handleUpdateChapter(req, res, bookId, chapterId, options = {}) {
  const payload = req ? JSON.parse(await collectBody(req)) : {};
  const library = await readLibrary();
  const book = library.books.find((item) => item.id === bookId);
  if (!book) return json(res, 404, { error: 'book not found' });
  const chapter = book.chapters.find((item) => item.id === chapterId);
  if (!chapter) return json(res, 404, { error: 'chapter not found' });
  if (Object.prototype.hasOwnProperty.call(payload, 'partTitle')) chapter.partTitle = String(payload.partTitle || '').trim() || TEXT.defaultPart;
  if (Object.prototype.hasOwnProperty.call(payload, 'sectionTitle')) chapter.sectionTitle = String(payload.sectionTitle || '').trim() || TEXT.defaultSection;
  if (Object.prototype.hasOwnProperty.call(payload, 'order')) chapter.order = Number(payload.order) || 1;
  if (Object.prototype.hasOwnProperty.call(payload, 'title')) chapter.title = String(payload.title || '').trim() || TEXT.unnamedChapter;
  if (Object.prototype.hasOwnProperty.call(payload, 'content')) chapter.content = String(payload.content || '');
  if (options.format) chapter.content = formatContent(chapter.content);
  const now = new Date().toISOString();
  chapter.updatedAt = now;
  book.updatedAt = now;
  await writeLibrary(library);
  json(res, 200, { ok: true, book: normalizeLibrary({ books: [book] }).books[0], chapter });
}

async function handleDeleteChapter(res, bookId, chapterId) {
  const library = await readLibrary();
  const book = library.books.find((item) => item.id === bookId);
  if (!book) return json(res, 404, { error: 'book not found' });
  const before = book.chapters.length;
  book.chapters = book.chapters.filter((chapter) => chapter.id !== chapterId);
  if (book.chapters.length === before) return json(res, 404, { error: 'chapter not found' });
  book.updatedAt = new Date().toISOString();
  await writeLibrary(library);
  json(res, 200, { ok: true, book });
}

async function handleCreateComment(req, res, bookId, chapterId) {
  const payload = JSON.parse(await collectBody(req));
  const content = String(payload.content || '').trim();
  if (!content) return json(res, 400, { error: 'comment content is required' });
  const library = await readLibrary();
  const book = library.books.find((item) => item.id === bookId);
  if (!book) return json(res, 404, { error: 'book not found' });
  const chapter = book.chapters.find((item) => item.id === chapterId);
  if (!chapter) return json(res, 404, { error: 'chapter not found' });
  chapter.comments = Array.isArray(chapter.comments) ? chapter.comments : [];
  const comment = {
    id: id('comment'),
    name: String(payload.name || '').trim() || TEXT.anonymous,
    content,
    viewerId: String(payload.viewerId || '').trim(),
    approved: false,
    approvedAt: null,
    createdAt: new Date().toISOString()
  };
  chapter.comments.push(comment);
  chapter.updatedAt = comment.createdAt;
  book.updatedAt = comment.createdAt;
  await writeLibrary(library);
  json(res, 201, { ok: true, comment, book: bookForViewer(book, comment.viewerId) });
}

async function handleApproveComment(res, bookId, chapterId, commentId) {
  const library = await readLibrary();
  const book = library.books.find((item) => item.id === bookId);
  if (!book) return json(res, 404, { error: 'book not found' });
  const chapter = book.chapters.find((item) => item.id === chapterId);
  if (!chapter) return json(res, 404, { error: 'chapter not found' });
  const comment = (chapter.comments || []).find((item) => item.id === commentId);
  if (!comment) return json(res, 404, { error: 'comment not found' });
  const now = new Date().toISOString();
  comment.approved = true;
  comment.approvedAt = now;
  chapter.updatedAt = now;
  book.updatedAt = now;
  await writeLibrary(library);
  json(res, 200, { ok: true, comment, book: normalizeLibrary({ books: [book] }).books[0] });
}

async function handleDeleteComment(res, bookId, chapterId, commentId) {
  const library = await readLibrary();
  const book = library.books.find((item) => item.id === bookId);
  if (!book) return json(res, 404, { error: 'book not found' });
  const chapter = book.chapters.find((item) => item.id === chapterId);
  if (!chapter) return json(res, 404, { error: 'chapter not found' });
  const before = Array.isArray(chapter.comments) ? chapter.comments.length : 0;
  chapter.comments = (chapter.comments || []).filter((comment) => comment.id !== commentId);
  if (chapter.comments.length === before) return json(res, 404, { error: 'comment not found' });
  const now = new Date().toISOString();
  chapter.updatedAt = now;
  book.updatedAt = now;
  await writeLibrary(library);
  json(res, 200, { ok: true, book: normalizeLibrary({ books: [book] }).books[0] });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const target = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!target.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
  try {
    send(res, 200, await fs.readFile(target), MIME[path.extname(target)] || 'application/octet-stream');
  } catch (error) {
    send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/import.html' || (req.method === 'POST' && url.pathname === '/api/import')) {
    if (!adminAuthorized(req)) {
      res.writeHead(401, { 'www-authenticate': 'Basic realm="Novel Admin"', 'content-type': 'text/plain; charset=utf-8' });
      return res.end('401 Unauthorized');
    }
  }
  if (req.method === 'GET' && url.pathname === '/api/books') return json(res, 200, libraryForViewer(await readLibrary(), url.searchParams.get('viewer')));
  if (req.method === 'POST' && url.pathname === '/api/import') return handleImport(req, res);
  const bookMatch = url.pathname.match(/^\/api\/books\/([^/]+)$/);
  if (bookMatch && req.method === 'PUT') return handleUpdateBook(req, res, decodeURIComponent(bookMatch[1]));
  if (bookMatch && req.method === 'DELETE') return handleDeleteBook(res, decodeURIComponent(bookMatch[1]));
  const chapterCreateMatch = url.pathname.match(/^\/api\/books\/([^/]+)\/chapters$/);
  if (chapterCreateMatch && req.method === 'POST') return handleCreateChapter(req, res, decodeURIComponent(chapterCreateMatch[1]));
  const chapterMatch = url.pathname.match(/^\/api\/books\/([^/]+)\/chapters\/([^/]+)$/);
  if (chapterMatch && req.method === 'PUT') return handleUpdateChapter(req, res, decodeURIComponent(chapterMatch[1]), decodeURIComponent(chapterMatch[2]));
  if (chapterMatch && req.method === 'DELETE') return handleDeleteChapter(res, decodeURIComponent(chapterMatch[1]), decodeURIComponent(chapterMatch[2]));
  const commentMatch = url.pathname.match(/^\/api\/books\/([^/]+)\/chapters\/([^/]+)\/comments$/);
  if (commentMatch && req.method === 'POST') return handleCreateComment(req, res, decodeURIComponent(commentMatch[1]), decodeURIComponent(commentMatch[2]));
  const commentDeleteMatch = url.pathname.match(/^\/api\/books\/([^/]+)\/chapters\/([^/]+)\/comments\/([^/]+)$/);
  if (commentDeleteMatch && req.method === 'DELETE') return handleDeleteComment(res, decodeURIComponent(commentDeleteMatch[1]), decodeURIComponent(commentDeleteMatch[2]), decodeURIComponent(commentDeleteMatch[3]));
  const commentApproveMatch = url.pathname.match(/^\/api\/books\/([^/]+)\/chapters\/([^/]+)\/comments\/([^/]+)\/approve$/);
  if (commentApproveMatch && req.method === 'POST') return handleApproveComment(res, decodeURIComponent(commentApproveMatch[1]), decodeURIComponent(commentApproveMatch[2]), decodeURIComponent(commentApproveMatch[3]));
  const formatMatch = url.pathname.match(/^\/api\/books\/([^/]+)\/chapters\/([^/]+)\/format$/);
  if (formatMatch && req.method === 'POST') return handleUpdateChapter(null, res, decodeURIComponent(formatMatch[1]), decodeURIComponent(formatMatch[2]), { format: true });
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
  send(res, 405, 'Method not allowed', 'text/plain; charset=utf-8');
});

server.listen(PORT, () => {
  console.log(`Novel reader running at http://localhost:${PORT}`);
});
