const state = {
  books: [],
  activeBookId: null,
  activeChapterId: null,
  forceEdit: false
};

const $ = (id) => document.getElementById(id);
const form = $('importForm');
const statusNode = $('status');
const bookList = $('bookList');
const editor = $('editor');

const TEXT = {
  saving: '\u6b63\u5728\u4fdd\u5b58...',
  failed: '\u4fdd\u5b58\u5931\u8d25',
  created: '\u4f5c\u54c1\u5df2\u521b\u5efa',
  appended: '\u7ae0\u8282\u5df2\u8ffd\u52a0',
  saveOk: '\u5df2\u4fdd\u5b58',
  deleted: '\u5df2\u5220\u9664',
  chapters: '\u7ae0',
  words: '\u5b57',
  noBooks: '\u6682\u65e0\u4f5c\u54c1',
  noChapter: '\u6682\u65e0\u7ae0\u8282',
  unnamed: '\u672a\u547d\u540d\u7ae0\u8282',
  deleteBookConfirm: '\u5220\u9664\u8fd9\u672c\u5c0f\u8bf4\uff1f',
  deleteChapterConfirm: '\u5220\u9664\u8fd9\u4e2a\u7ae0\u8282\uff1f',
  createFirst: '\u5148\u521b\u5efa\u4f5c\u54c1\uff0c\u7136\u540e\u6301\u7eed\u8ffd\u52a0\u7ae0\u8282',
  bookInfo: '\u4f5c\u54c1\u4fe1\u606f',
  chapterManage: '\u7ae0\u8282',
  chapterDetail: '\u7ae0\u8282\u6982\u89c8',
  title: '\u4f5c\u54c1\u540d',
  author: '\u4f5c\u8005',
  summary: '\u7b80\u4ecb',
  updatedAt: '\u66f4\u65b0\u65e5\u671f',
  forceEdit: '\u5f3a\u5236\u7f16\u8f91',
  lockEdit: '\u9501\u5b9a\u4fe1\u606f',
  saveBook: '\u4fdd\u5b58\u4fe1\u606f',
  saveChapter: '\u4fdd\u5b58\u7ae0\u8282',
  deleteBook: '\u5220\u9664\u672c\u4e66',
  deleteChapter: '\u5220\u9664\u7ae0\u8282',
  appendChapter: '\u8ffd\u52a0\u7ae0\u8282',
  firstChapter: '\u521b\u5efa\u4f5c\u54c1',
  partTitle: '\u7b2c\u51e0\u90e8',
  sectionTitle: '\u7b2c\u51e0\u7bc7',
  chapterTitle: '\u7ae0\u8282\u540d',
  content: '\u6b63\u6587',
  editChapter: '\u7ae0\u8282\u7f16\u8f91',
  comments: '\u8bc4\u8bba',
  noComments: '\u6682\u65e0\u8bc4\u8bba',
  deleteComment: '\u5220\u9664',
  deleteCommentConfirm: '\u5220\u9664\u8fd9\u6761\u8bc4\u8bba\uff1f',
  anonymous: '\u8bfb\u8005'
};

const escapeHtml = (value = '') => String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
const words = (text = '') => (String(text).match(/[\u4e00-\u9fff]|[A-Za-z0-9]+/g) || []).length;

function activeBook() {
  return state.books[0] || null;
}

function activeChapter() {
  const book = activeBook();
  return book?.chapters?.find((chapter) => chapter.id === state.activeChapterId) || book?.chapters?.[0] || null;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
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
  state.books = (data.books || []).slice(0, 1);
  const book = activeBook();
  state.activeBookId = book?.id || null;
  if (!keepSelection || !book?.chapters?.some((chapter) => chapter.id === state.activeChapterId)) {
    state.activeChapterId = book?.chapters?.[0]?.id || null;
  }
  render();
}

function render() {
  renderForm();
  renderBookList();
  renderEditor();
}

function renderForm() {
  const book = activeBook();
  const hasBook = !!book;
  $('title').value = hasBook ? book.title || '' : $('title').value;
  $('author').value = hasBook ? book.author || '' : $('author').value;
  $('summary').value = hasBook ? book.summary || '' : $('summary').value;
  $('title').disabled = hasBook;
  $('author').disabled = hasBook;
  $('summary').disabled = hasBook;
  $('submitLabel').textContent = hasBook ? TEXT.appendChapter : TEXT.firstChapter;
  $('bookFieldsHint').textContent = hasBook ? '\u4f5c\u54c1\u540d\u548c\u4f5c\u8005\u5df2\u56fa\u5b9a\uff0c\u65b0\u5185\u5bb9\u4f1a\u6309\u7ae0\u8282\u7ee7\u7eed\u5f80\u540e\u6392\u3002' : TEXT.createFirst;
}

function renderBookList() {
  const book = activeBook();
  if (!book) {
    bookList.innerHTML = `<div class="empty-panel">${TEXT.noBooks}</div>`;
    return;
  }
  const total = (book.chapters || []).reduce((sum, chapter) => sum + words(chapter.content), 0);
  const updatedAt = formatDate(book.updatedAt);
  bookList.innerHTML = `<button class="book-button active" data-book-id="${book.id}">
    <strong>${escapeHtml(book.title)}</strong>
    <span>${escapeHtml(book.author || '')} \u00b7 ${(book.chapters || []).length} ${TEXT.chapters} \u00b7 ${total} ${TEXT.words}${updatedAt ? ` \u00b7 ${TEXT.updatedAt}: ${escapeHtml(updatedAt)}` : ''}</span>
  </button>`;
}

function renderComments(chapter) {
  return `
    <section class="admin-comments">
      <h3>${TEXT.comments} (${(chapter.comments || []).length})</h3>
      <div class="admin-comment-list">
        ${(chapter.comments || []).length ? chapter.comments.slice().reverse().map((comment) => `
          <article class="admin-comment-item">
            <div><strong>${escapeHtml(comment.name || TEXT.anonymous)}</strong><time>${escapeHtml(formatDate(comment.createdAt))}</time></div>
            <p>${escapeHtml(comment.content || '')}</p>
            <button class="danger-btn" type="button" data-comment-id="${comment.id}">${TEXT.deleteComment}</button>
          </article>
        `).join('') : `<div class="empty-panel">${TEXT.noComments}</div>`}
      </div>
    </section>
  `;
}

function renderEditor() {
  const book = activeBook();
  if (!book) {
    editor.innerHTML = `<div class="empty-panel">${TEXT.createFirst}</div>`;
    return;
  }
  const chapter = activeChapter();
  const locked = !state.forceEdit;
  const bookUpdatedAt = formatDate(book.updatedAt);
  const chapterUpdatedAt = formatDate(chapter?.updatedAt || book.updatedAt);
  editor.innerHTML = `
    <section class="editor-card">
      <div class="editor-head">
        <h2 class="section-title">${TEXT.bookInfo}</h2>
        <button class="ghost-btn" id="forceEditBtn" type="button">${locked ? TEXT.forceEdit : TEXT.lockEdit}</button>
      </div>
      <div class="editor-form">
        <label class="field"><span>${TEXT.title}</span><input id="editBookTitle" value="${escapeHtml(book.title)}" ${locked ? 'disabled' : ''}></label>
        <label class="field"><span>${TEXT.author}</span><input id="editBookAuthor" value="${escapeHtml(book.author || '')}" ${locked ? 'disabled' : ''}></label>
        <label class="field"><span>${TEXT.summary}</span><textarea id="editBookSummary" ${locked ? 'disabled' : ''}>${escapeHtml(book.summary || '')}</textarea></label>
        ${bookUpdatedAt ? `<div class="chapter-summary"><span>${TEXT.updatedAt}: ${escapeHtml(bookUpdatedAt)}</span></div>` : ''}
        <div class="row-actions">
          <button class="primary-btn" id="saveBookBtn" type="button" ${locked ? 'disabled' : ''}>${TEXT.saveBook}</button>
          <button class="danger-btn" id="deleteBookBtn" type="button">${TEXT.deleteBook}</button>
        </div>
      </div>
    </section>
    <section class="editor-card">
      <h2 class="section-title">${TEXT.chapterManage}</h2>
      <div class="chapter-list">
        ${(book.chapters || []).length ? book.chapters.map((item, index) => `<button class="chapter-button ${item.id === state.activeChapterId ? 'active' : ''}" data-chapter-id="${item.id}"><strong>${index + 1}. ${escapeHtml(item.title || TEXT.unnamed)}</strong><span>${escapeHtml(item.partTitle || '\u7b2c1\u90e8')} / ${escapeHtml(item.sectionTitle || '\u7b2c1\u7bc7')} \u00b7 ${words(item.content)} ${TEXT.words}</span></button>`).join('') : `<div class="empty-panel">${TEXT.noChapter}</div>`}
      </div>
    </section>
    <section class="editor-card chapter-overview">
      <div class="editor-head"><h2 class="section-title">${TEXT.editChapter}</h2></div>
      ${chapter ? `
        <div class="chapter-edit-form">
          <label class="field"><span>${TEXT.chapterTitle}</span><input id="editChapterTitle" value="${escapeHtml(chapter.title || '')}"></label>
          <label class="field"><span>${TEXT.content}</span><textarea id="editChapterContent" class="chapter-content">${escapeHtml(chapter.content || '')}</textarea></label>
          <div class="chapter-summary"><span>${escapeHtml(chapter.partTitle || '\u7b2c1\u90e8')} / ${escapeHtml(chapter.sectionTitle || '\u7b2c1\u7bc7')} \u00b7 ${words(chapter.content)} ${TEXT.words}${chapterUpdatedAt ? ` \u00b7 ${TEXT.updatedAt}: ${escapeHtml(chapterUpdatedAt)}` : ''}</span></div>
          <div class="row-actions">
            <button class="primary-btn" id="saveChapterBtn" type="button">${TEXT.saveChapter}</button>
            <button class="danger-btn" id="deleteChapterBtn" type="button">${TEXT.deleteChapter}</button>
          </div>
        </div>
        ${renderComments(chapter)}
      ` : `<div class="empty-panel">${TEXT.noChapter}</div>`}
    </section>
  `;
}

async function saveBook() {
  const book = activeBook();
  if (!book || !state.forceEdit) return;
  const data = await requestJson(`/api/books/${encodeURIComponent(book.id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      force: true,
      title: $('editBookTitle').value.trim(),
      author: $('editBookAuthor').value.trim(),
      summary: $('editBookSummary').value.trim()
    })
  });
  setStatus(TEXT.saveOk);
  state.forceEdit = false;
  await loadBooks(true);
  state.activeBookId = data.book.id;
  render();
}

async function deleteBook() {
  const book = activeBook();
  if (!book || !confirm(TEXT.deleteBookConfirm)) return;
  await requestJson(`/api/books/${encodeURIComponent(book.id)}`, { method: 'DELETE' });
  setStatus(TEXT.deleted);
  state.forceEdit = false;
  state.activeBookId = null;
  state.activeChapterId = null;
  await loadBooks(false);
}

async function saveChapterFromForm() {
  const book = activeBook();
  const chapterTitle = $('chapterTitle').value.trim();
  const content = $('content').value.trim();
  if (!chapterTitle || !content) return;
  const isFirst = !book;
  const url = isFirst ? '/api/import' : `/api/books/${encodeURIComponent(book.id)}/chapters`;
  const data = await requestJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: $('title').value.trim(),
      author: $('author').value.trim(),
      summary: $('summary').value.trim(),
      chapterTitle,
      content
    })
  });
  setStatus(isFirst ? TEXT.created : TEXT.appended);
  $('chapterTitle').value = '';
  $('content').value = '';
  await loadBooks(true);
  state.activeBookId = data.book.id;
  state.activeChapterId = data.chapter.id;
  render();
}

async function saveSelectedChapter() {
  const book = activeBook();
  const chapter = activeChapter();
  if (!book || !chapter) return;
  const data = await requestJson(`/api/books/${encodeURIComponent(book.id)}/chapters/${encodeURIComponent(chapter.id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: $('editChapterTitle').value.trim(),
      content: $('editChapterContent').value
    })
  });
  setStatus(TEXT.saveOk);
  await loadBooks(true);
  state.activeBookId = data.book.id;
  state.activeChapterId = data.chapter.id;
  render();
}

async function deleteSelectedChapter() {
  const book = activeBook();
  const chapter = activeChapter();
  if (!book || !chapter || !confirm(TEXT.deleteChapterConfirm)) return;
  const chapters = book.chapters || [];
  const currentIndex = chapters.findIndex((item) => item.id === chapter.id);
  const data = await requestJson(`/api/books/${encodeURIComponent(book.id)}/chapters/${encodeURIComponent(chapter.id)}`, { method: 'DELETE' });
  const remaining = data.book?.chapters || [];
  const nextChapter = remaining[Math.min(Math.max(currentIndex, 0), Math.max(remaining.length - 1, 0))] || null;
  setStatus(TEXT.deleted);
  await loadBooks(false);
  state.activeBookId = data.book.id;
  state.activeChapterId = nextChapter?.id || null;
  render();
}

async function deleteComment(commentId) {
  const book = activeBook();
  const chapter = activeChapter();
  if (!book || !chapter || !commentId || !confirm(TEXT.deleteCommentConfirm)) return;
  const data = await requestJson(`/api/books/${encodeURIComponent(book.id)}/chapters/${encodeURIComponent(chapter.id)}/comments/${encodeURIComponent(commentId)}`, { method: 'DELETE' });
  setStatus(TEXT.deleted);
  await loadBooks(true);
  state.activeBookId = data.book.id;
  state.activeChapterId = chapter.id;
  render();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(TEXT.saving);
  try {
    await saveChapterFromForm();
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
  const commentButton = event.target.closest('[data-comment-id]');
  if (commentButton) {
    try {
      await deleteComment(commentButton.dataset.commentId);
    } catch (error) {
      setStatus(error.message || TEXT.failed);
    }
    return;
  }
  if (chapterButton) {
    state.activeChapterId = chapterButton.dataset.chapterId;
    render();
    return;
  }
  try {
    if (event.target.closest('#forceEditBtn')) {
      state.forceEdit = !state.forceEdit;
      renderEditor();
    }
    if (event.target.closest('#saveBookBtn')) await saveBook();
    if (event.target.closest('#saveChapterBtn')) await saveSelectedChapter();
    if (event.target.closest('#deleteChapterBtn')) await deleteSelectedChapter();
    if (event.target.closest('#deleteBookBtn')) await deleteBook();
  } catch (error) {
    setStatus(error.message || TEXT.failed);
  }
});

$('refreshBooks').addEventListener('click', () => loadBooks(true).catch((error) => setStatus(error.message || TEXT.failed)));
loadBooks(false).catch((error) => setStatus(error.message || TEXT.failed));
