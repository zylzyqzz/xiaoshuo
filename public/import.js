const state = {
  books: [],
  activeBookId: null,
  activeChapterId: null
};

const $ = (id) => document.getElementById(id);
const form = $('importForm');
const statusNode = $('status');
const bookList = $('bookList');
const editor = $('editor');

const TEXT = {
  importing: '\u6b63\u5728\u5bfc\u5165...',
  failed: '\u5bfc\u5165\u5931\u8d25',
  success: '\u5bfc\u5165\u6210\u529f',
  saveOk: '\u5df2\u4fdd\u5b58',
  deleted: '\u5df2\u5220\u9664',
  formatted: '\u5df2\u81ea\u52a8\u6392\u7248',
  chapters: '\u7ae0',
  words: '\u5b57',
  noBooks: '\u6682\u65e0\u4f5c\u54c1',
  noChapter: '\u6682\u65e0\u7ae0\u8282',
  unnamed: '\u672a\u547d\u540d\u7ae0\u8282',
  deleteBookConfirm: '\u5220\u9664\u8fd9\u672c\u5c0f\u8bf4\uff1f',
  deleteChapterConfirm: '\u5220\u9664\u8fd9\u4e00\u7ae0\uff1f',
  chooseBook: '\u9009\u62e9\u4e00\u672c\u5c0f\u8bf4\u8fdb\u884c\u7ba1\u7406',
  bookInfo: '\u4f5c\u54c1\u4fe1\u606f',
  chapterManage: '\u7ae0\u8282',
  editChapter: '\u7ae0\u8282\u7f16\u8f91',
  partTitle: '\u7b2c\u51e0\u90e8',
  sectionTitle: '\u7b2c\u51e0\u7bc7',
  order: '\u987a\u5e8f',
  title: '\u4f5c\u54c1\u540d',
  author: '\u4f5c\u8005',
  summary: '\u7b80\u4ecb',
  chapterTitle: '\u7ae0\u8282\u540d',
  content: '\u6b63\u6587',
  saveBook: '\u4fdd\u5b58\u4fe1\u606f',
  deleteBook: '\u5220\u9664\u672c\u4e66',
  saveChapter: '\u4fdd\u5b58\u7ae0\u8282',
  autoFormat: '\u81ea\u52a8\u6392\u7248',
  deleteChapter: '\u5220\u9664\u7ae0\u8282'
};

const escapeHtml = (value = '') => String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
const words = (text = '') => (String(text).match(/[\u4e00-\u9fff]|[A-Za-z0-9]+/g) || []).length;

function activeBook() {
  return state.books.find((book) => book.id === state.activeBookId) || state.books[0];
}

function activeChapter() {
  const book = activeBook();
  return book?.chapters?.find((chapter) => chapter.id === state.activeChapterId) || book?.chapters?.[0];
}

function setStatus(message) {
  statusNode.textContent = message || '';
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || TEXT.failed);
  return data;
}

async function loadBooks(keepSelection = true) {
  const data = await requestJson('/api/books');
  state.books = data.books || [];
  if (!keepSelection || !state.books.some((book) => book.id === state.activeBookId)) {
    state.activeBookId = state.books[0]?.id || null;
  }
  const book = activeBook();
  if (!book?.chapters?.some((chapter) => chapter.id === state.activeChapterId)) {
    state.activeChapterId = book?.chapters?.[0]?.id || null;
  }
  render();
}

function render() {
  renderBookList();
  renderEditor();
}

function renderBookList() {
  bookList.innerHTML = state.books.length ? state.books.map((book) => {
    const total = (book.chapters || []).reduce((sum, chapter) => sum + words(chapter.content), 0);
    return `<button class="book-button ${book.id === state.activeBookId ? 'active' : ''}" data-book-id="${book.id}">
      <strong>${escapeHtml(book.title)}</strong>
      <span>${(book.chapters || []).length} ${TEXT.chapters} · ${total} ${TEXT.words}</span>
    </button>`;
  }).join('') : `<div class="empty-panel">${TEXT.noBooks}</div>`;
}

function renderEditor() {
  const book = activeBook();
  if (!book) {
    editor.innerHTML = `<div class="empty-panel">${TEXT.chooseBook}</div>`;
    return;
  }
  const chapter = activeChapter();
  editor.innerHTML = `
    <section class="editor-card">
      <div class="editor-head">
        <h2 class="section-title">${TEXT.bookInfo}</h2>
        <button class="danger-btn" id="deleteBookBtn" type="button">${TEXT.deleteBook}</button>
      </div>
      <div class="editor-form">
        <label class="field"><span>${TEXT.title}</span><input id="editBookTitle" value="${escapeHtml(book.title)}"></label>
        <label class="field"><span>${TEXT.author}</span><input id="editBookAuthor" value="${escapeHtml(book.author || '')}"></label>
        <label class="field"><span>${TEXT.summary}</span><textarea id="editBookSummary">${escapeHtml(book.summary || '')}</textarea></label>
        <div class="row-actions"><button class="primary-btn" id="saveBookBtn" type="button">${TEXT.saveBook}</button></div>
      </div>
    </section>
    <section class="editor-card">
      <h2 class="section-title">${TEXT.chapterManage}</h2>
      <div class="chapter-list">
        ${(book.chapters || []).length ? book.chapters.map((item, index) => `<button class="chapter-button ${item.id === state.activeChapterId ? 'active' : ''}" data-chapter-id="${item.id}"><strong>${index + 1}. ${escapeHtml(item.title || TEXT.unnamed)}</strong><span>${escapeHtml(item.partTitle || '\u7b2c1\u90e8')} / ${escapeHtml(item.sectionTitle || '\u7b2c1\u7bc7')} · ${words(item.content)} ${TEXT.words}</span></button>`).join('') : `<div class="empty-panel">${TEXT.noChapter}</div>`}
      </div>
    </section>
    <section class="editor-card chapter-editor">
      <div class="editor-head">
        <h2 class="section-title">${TEXT.editChapter}</h2>
        ${chapter ? `<button class="danger-btn" id="deleteChapterBtn" type="button">${TEXT.deleteChapter}</button>` : ''}
      </div>
      ${chapter ? `
        <label class="field"><span>${TEXT.partTitle}</span><input id="chapterPartInput" value="${escapeHtml(chapter.partTitle || '\u7b2c1\u90e8')}"></label>
        <label class="field"><span>${TEXT.sectionTitle}</span><input id="chapterSectionInput" value="${escapeHtml(chapter.sectionTitle || '\u7b2c1\u7bc7')}"></label>
        <label class="field"><span>${TEXT.order}</span><input id="chapterOrderInput" type="number" min="1" value="${Number(chapter.order || 1)}"></label>
        <label class="field"><span>${TEXT.chapterTitle}</span><input id="chapterTitleInput" value="${escapeHtml(chapter.title || '')}"></label>
        <label class="field"><span>${TEXT.content}</span><textarea id="chapterContent">${escapeHtml(chapter.content || '')}</textarea></label>
        <div class="row-actions">
          <button class="primary-btn" id="saveChapterBtn" type="button">${TEXT.saveChapter}</button>
          <button class="ghost-btn" id="formatChapterBtn" type="button">${TEXT.autoFormat}</button>
        </div>
      ` : `<div class="empty-panel">${TEXT.noChapter}</div>`}
    </section>
  `;
}

async function saveBook() {
  const book = activeBook();
  if (!book) return;
  const data = await requestJson(`/api/books/${encodeURIComponent(book.id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: $('editBookTitle').value.trim(),
      author: $('editBookAuthor').value.trim(),
      summary: $('editBookSummary').value.trim()
    })
  });
  setStatus(TEXT.saveOk);
  await loadBooks(true);
  state.activeBookId = data.book.id;
  render();
}

async function deleteBook() {
  const book = activeBook();
  if (!book || !confirm(TEXT.deleteBookConfirm)) return;
  await requestJson(`/api/books/${encodeURIComponent(book.id)}`, { method: 'DELETE' });
  setStatus(TEXT.deleted);
  state.activeBookId = null;
  state.activeChapterId = null;
  await loadBooks(false);
}

async function saveChapter() {
  const book = activeBook();
  const chapter = activeChapter();
  if (!book || !chapter) return;
  const data = await requestJson(`/api/books/${encodeURIComponent(book.id)}/chapters/${encodeURIComponent(chapter.id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      partTitle: $('chapterPartInput').value.trim(),
      sectionTitle: $('chapterSectionInput').value.trim(),
      order: Number($('chapterOrderInput').value) || 1,
      title: $('chapterTitleInput').value.trim(),
      content: $('chapterContent').value
    })
  });
  setStatus(TEXT.saveOk);
  await loadBooks(true);
  state.activeBookId = data.book.id;
  state.activeChapterId = data.chapter.id;
  render();
}

async function formatChapter() {
  const book = activeBook();
  const chapter = activeChapter();
  if (!book || !chapter) return;
  await saveChapter();
  const data = await requestJson(`/api/books/${encodeURIComponent(book.id)}/chapters/${encodeURIComponent(chapter.id)}/format`, { method: 'POST' });
  setStatus(TEXT.formatted);
  await loadBooks(true);
  state.activeBookId = data.book.id;
  state.activeChapterId = data.chapter.id;
  render();
}

async function deleteChapter() {
  const book = activeBook();
  const chapter = activeChapter();
  if (!book || !chapter || !confirm(TEXT.deleteChapterConfirm)) return;
  await requestJson(`/api/books/${encodeURIComponent(book.id)}/chapters/${encodeURIComponent(chapter.id)}`, { method: 'DELETE' });
  setStatus(TEXT.deleted);
  await loadBooks(true);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const file = $('file').files[0];
  if (!file) return;
  setStatus(TEXT.importing);
  try {
    const content = await file.text();
    const data = await requestJson('/api/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: $('title').value.trim() || file.name.replace(/\.[^.]+$/, ''),
        author: $('author').value.trim(),
        summary: $('summary').value.trim(),
        splitMode: 'single',
        content
      })
    });
    setStatus(`${TEXT.success}: ${data.book.title}`);
    form.reset();
    state.activeBookId = data.book.id;
    state.activeChapterId = data.book.chapters[0]?.id || null;
    await loadBooks(true);
  } catch (error) {
    setStatus(error.message || TEXT.failed);
  }
});

bookList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-book-id]');
  if (!button) return;
  state.activeBookId = button.dataset.bookId;
  state.activeChapterId = activeBook()?.chapters?.[0]?.id || null;
  render();
});

editor.addEventListener('click', async (event) => {
  const chapterButton = event.target.closest('[data-chapter-id]');
  if (chapterButton) {
    state.activeChapterId = chapterButton.dataset.chapterId;
    render();
    return;
  }
  try {
    if (event.target.closest('#saveBookBtn')) await saveBook();
    if (event.target.closest('#deleteBookBtn')) await deleteBook();
    if (event.target.closest('#saveChapterBtn')) await saveChapter();
    if (event.target.closest('#formatChapterBtn')) await formatChapter();
    if (event.target.closest('#deleteChapterBtn')) await deleteChapter();
  } catch (error) {
    setStatus(error.message || TEXT.failed);
  }
});

$('refreshBooks').addEventListener('click', () => loadBooks(true).catch((error) => setStatus(error.message || TEXT.failed)));
loadBooks(false).catch((error) => setStatus(error.message || TEXT.failed));
