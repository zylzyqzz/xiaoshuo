const state = {
  books: [],
  activeBookId: null,
  activeChapterId: null,
  query: '',
  settings: loadSettings(),
  saveTimer: null
};

const $ = (id) => document.getElementById(id);
const words = (text = '') => (String(text).match(/[\u4e00-\u9fff]|[A-Za-z0-9]+/g) || []).length;
const escapeHtml = (value = '') => String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));

const UI = {
  siteName: 'yulin\u7684\u79c1\u4eba\u4e66\u5e93',
  noBooks: '\u6ca1\u6709\u4f5c\u54c1',
  importHint: '\u53bb\u540e\u53f0\u521b\u5efa\u4f5c\u54c1\u5e76\u8ffd\u52a0\u7ae0\u8282',
  emptyShelf: '\u7a7a\u4e66\u5e93',
  importFirst: '\u8bf7\u5148\u5bfc\u5165\u5c0f\u8bf4',
  noContent: '\u6682\u65e0\u5185\u5bb9',
  chapter: '\u7ae0',
  words: '\u5b57',
  author: '\u4f5c\u8005',
  updatedAt: '\u66f4\u65b0\u65e5\u671f',
  unnamed: '\u672a\u547d\u540d\u7ae0\u8282',
  defaultPart: '\u7b2c1\u90e8',
  defaultSection: '\u7b2c1\u7bc7',
  emptyChapter: '\u6682\u65e0\u7ae0\u8282',
  emptyChapterBody: '\u672c\u7ae0\u6682\u65e0\u6b63\u6587',
  loadFailed: '\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u540e\u7aef\u670d\u52a1\u3002',
  enterFullscreen: '\u8fdb\u5165\u5168\u5c4f',
  exitFullscreen: '\u9000\u51fa\u5168\u5c4f',
  noComments: '\u6682\u65e0\u8bc4\u8bba',
  commentUnit: '\u6761',
  commentFailed: '\u8bc4\u8bba\u53d1\u8868\u5931\u8d25',
  anonymous: '\u8bfb\u8005'
};

function loadSettings() {
  try {
    return { fontSize: 19, lineHeight: 20, readerWidth: 760, theme: 'paper', ...JSON.parse(localStorage.getItem('reader.settings') || '{}') };
  } catch (error) {
    return { fontSize: 19, lineHeight: 20, readerWidth: 760, theme: 'paper' };
  }
}

function saveSettings() {
  localStorage.setItem('reader.settings', JSON.stringify(state.settings));
}

function getViewerId() {
  let value = localStorage.getItem('reader.viewerId');
  if (!value) {
    value = `viewer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('reader.viewerId', value);
  }
  return value;
}

const viewerId = getViewerId();

function loadLastRead() {
  try {
    return JSON.parse(localStorage.getItem('reader.last') || '{}');
  } catch (error) {
    return {};
  }
}

function saveLastRead() {
  const chapter = activeChapter();
  const book = activeBook();
  if (!book || !chapter) return;
  localStorage.setItem('reader.last', JSON.stringify({
    bookId: book.id,
    chapterId: chapter.id,
    scrollTop: window.scrollY || document.documentElement.scrollTop || 0,
    updatedAt: Date.now()
  }));
}

function normalizeChapter(chapter, index = 0) {
  return {
    ...chapter,
    partTitle: chapter.partTitle || UI.defaultPart,
    sectionTitle: chapter.sectionTitle || UI.defaultSection,
    order: Number.isFinite(Number(chapter.order)) ? Number(chapter.order) : index + 1,
    title: chapter.title || UI.unnamed,
    content: chapter.content || '',
    comments: Array.isArray(chapter.comments) ? chapter.comments : []
  };
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function chaptersOf(book) {
  return (book?.chapters || []).map(normalizeChapter).sort((a, b) => (a.order || 0) - (b.order || 0));
}

function activeBook() {
  return state.books[0] || null;
}

function activeChapter() {
  const book = activeBook();
  return chaptersOf(book).find((chapter) => chapter.id === state.activeChapterId) || chaptersOf(book)[0];
}

async function loadLibrary() {
  const response = await fetch(`/api/books?viewer=${encodeURIComponent(viewerId)}`);
  if (!response.ok) throw new Error('library request failed');
  const data = await response.json();
  state.books = (data.books || []).slice(0, 1);
  const last = loadLastRead();
  const lastBook = state.books.find((book) => book.id === last.bookId);
  const lastChapter = chaptersOf(lastBook).find((chapter) => chapter.id === last.chapterId);
  state.activeBookId = lastBook?.id || state.books[0]?.id || null;
  state.activeChapterId = lastChapter?.id || chaptersOf(activeBook())[0]?.id || null;
  applySettings();
  render({ restore: true });
}

function render(options = {}) {
  renderShelf();
  renderReader(options);
  renderComments();
}

function groupedChapters(chapters) {
  const groups = [];
  chapters.forEach((chapter, index) => {
    let part = groups.find((item) => item.title === chapter.partTitle);
    if (!part) {
      part = { title: chapter.partTitle, sections: [] };
      groups.push(part);
    }
    let section = part.sections.find((item) => item.title === chapter.sectionTitle);
    if (!section) {
      section = { title: chapter.sectionTitle, chapters: [] };
      part.sections.push(section);
    }
    section.chapters.push({ chapter, index });
  });
  return groups;
}

function renderShelf() {
  const book = activeBook();
  if (!book) {
    $('bookList').innerHTML = `<div class="book-card"><strong>${UI.noBooks}</strong><span>${UI.importHint}</span></div>`;
    return;
  }
  const query = state.query.trim().toLowerCase();
  const allChapters = chaptersOf(book);
  const updatedAt = formatDate(book.updatedAt);
  const chapters = allChapters.map((chapter, index) => ({ ...chapter, displayIndex: index })).filter((chapter) => {
    const text = [chapter.partTitle, chapter.sectionTitle, chapter.title, chapter.content].join('\n').toLowerCase();
    return !query || text.includes(query);
  });
  const count = allChapters.reduce((sum, chapter) => sum + words(chapter.content), 0);
  const groups = groupedChapters(chapters);
  $('bookList').innerHTML = `
    <div class="shelf-book-picker">
      <strong>${escapeHtml(book.title || UI.siteName)}</strong>
      <div class="shelf-book-meta">${UI.author}: ${escapeHtml(book.author || '')} · ${allChapters.length} ${UI.chapter} · ${count} ${UI.words}${updatedAt ? ` · ${UI.updatedAt}: ${escapeHtml(updatedAt)}` : ''}</div>
    </div>
    <div class="toc-list">
      ${groups.length ? groups.map((part) => `
        <section class="toc-part">
          <h2>${escapeHtml(part.title)}</h2>
          ${part.sections.map((section) => `
            <div class="toc-section">
              <h3>${escapeHtml(section.title)}</h3>
              ${section.chapters.map(({ chapter, index }) => `<button class="toc-item ${chapter.id === state.activeChapterId ? 'active' : ''}" data-book-id="${book.id}" data-chapter-id="${chapter.id}"><span>${chapter.displayIndex + 1}</span><strong>${escapeHtml(chapter.title || UI.unnamed)}</strong></button>`).join('')}
            </div>
          `).join('')}
        </section>
      `).join('') : `<div class="toc-empty">${UI.emptyChapter}</div>`}
    </div>
  `;
}

function renderReader(options = {}) {
  const book = activeBook();
  const chapter = activeChapter();
  if (!book || !chapter) {
    $('bookTitle').textContent = book?.title || UI.noBooks;
    $('topBookTitle').textContent = book?.title || UI.siteName;
    $('chapterTitle').textContent = book ? UI.emptyChapter : UI.importFirst;
    $('bookMeta').textContent = book ? `0 ${UI.chapter}` : UI.emptyShelf;
    $('chapterProgress').textContent = '';
    $('reader').innerHTML = `<div class="empty">${book ? UI.emptyChapter : UI.noContent}</div>`;
    $('chapterSelect').innerHTML = '';
    $('prevChapter').disabled = true;
    $('nextChapter').disabled = true;
    updateScrollProgress();
    return;
  }
  const chapters = chaptersOf(book);
  const index = chapters.findIndex((item) => item.id === chapter.id);
  const totalWords = chapters.reduce((sum, item) => sum + words(item.content), 0);
  const chapterWords = words(chapter.content);
  const updatedAt = formatDate(chapter.updatedAt || book.updatedAt);
  $('bookTitle').textContent = `${book.title} · ${UI.author}: ${book.author || ''}`;
  $('topBookTitle').textContent = book.title;
  $('chapterTitle').textContent = chapter.title || UI.unnamed;
  $('bookMeta').textContent = `${chapters.length} ${UI.chapter} · ${totalWords} ${UI.words}${formatDate(book.updatedAt) ? ` · ${UI.updatedAt}: ${formatDate(book.updatedAt)}` : ''}`;
  $('chapterProgress').textContent = `${chapter.partTitle} / ${chapter.sectionTitle} · ${index + 1} / ${chapters.length} · ${chapterWords} ${UI.words}${updatedAt ? ` · ${UI.updatedAt}: ${updatedAt}` : ''}`;
  $('chapterSelect').innerHTML = chapters.map((item, idx) => `<option value="${item.id}" ${item.id === chapter.id ? 'selected' : ''}>${escapeHtml(item.partTitle)} / ${escapeHtml(item.sectionTitle)} / ${idx + 1}. ${escapeHtml(item.title || UI.unnamed)}</option>`).join('');
  const content = chapter.content?.trim();
  $('reader').innerHTML = content ? content.split(/\n{2,}/).map((part) => `<p>${escapeHtml(part.trim())}</p>`).join('') : `<div class="empty">${UI.emptyChapterBody}</div>`;
  $('prevChapter').disabled = index <= 0;
  $('nextChapter').disabled = index >= chapters.length - 1;
  document.title = UI.siteName;
  if (options.restore) restoreReadingPosition();
  else updateScrollProgress();
  saveLastRead();
}

function renderComments() {
  const chapter = activeChapter();
  const comments = chapter?.comments || [];
  $('commentsCount').textContent = `${comments.length} ${UI.commentUnit}`;
  $('commentList').innerHTML = comments.length ? comments.slice().reverse().map((comment) => `
    <article class="comment-item">
      <div><strong>${escapeHtml(comment.name || UI.anonymous)}</strong><time>${escapeHtml(formatDate(comment.createdAt))}</time></div>
      <p>${escapeHtml(comment.content || '')}</p>
    </article>
  `).join('') : `<div class="comment-empty">${UI.noComments}</div>`;
}

async function submitComment(event) {
  event.preventDefault();
  const book = activeBook();
  const chapter = activeChapter();
  const content = $('commentContent').value.trim();
  if (!book || !chapter || !content) return;
  const button = $('commentForm').querySelector('button');
  button.disabled = true;
  try {
    const response = await fetch(`/api/books/${encodeURIComponent(book.id)}/chapters/${encodeURIComponent(chapter.id)}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: $('commentName').value.trim(), content, viewerId })
    });
    if (!response.ok) throw new Error(UI.commentFailed);
    const data = await response.json();
    state.books = state.books.map((item) => item.id === data.book.id ? data.book : item);
    $('commentContent').value = '';
    renderComments();
  } catch (error) {
    alert(error.message || UI.commentFailed);
  } finally {
    button.disabled = false;
  }
}

function restoreReadingPosition() {
  const last = loadLastRead();
  const shouldRestore = last.bookId === state.activeBookId && last.chapterId === state.activeChapterId;
  requestAnimationFrame(() => {
    window.scrollTo({ top: shouldRestore ? Number(last.scrollTop || 0) : 0, behavior: 'auto' });
    updateScrollProgress();
  });
}

function selectBook(bookId) {
  const book = state.books.find((item) => item.id === bookId);
  if (!book) return;
  state.activeBookId = book.id;
  state.activeChapterId = chaptersOf(book)[0]?.id || null;
  state.query = '';
  $('search').value = '';
  closeOverlays();
  render({ restore: false });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  saveLastRead();
}

function selectChapter(bookId, chapterId, close = true) {
  state.activeBookId = bookId;
  state.activeChapterId = chapterId;
  if (close) closeOverlays();
  render({ restore: false });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  saveLastRead();
}

function switchChapter(offset) {
  const book = activeBook();
  const chapter = activeChapter();
  if (!book || !chapter) return;
  const chapters = chaptersOf(book);
  const index = chapters.findIndex((item) => item.id === chapter.id);
  const next = chapters[index + offset];
  if (!next) return;
  selectChapter(book.id, next.id, false);
}

function updateScrollProgress() {
  const total = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const percent = Math.max(0, Math.min(100, Math.round(((window.scrollY || document.documentElement.scrollTop || 0) / total) * 100)));
  $('readProgressBar').style.width = `${percent}%`;
  $('readingProgressText').textContent = `${percent}%`;
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveLastRead, 250);
}

function openSettings() {
  document.body.classList.add('settings-open');
  $('settingsPanel').setAttribute('aria-hidden', 'false');
}

function closeOverlays() {
  document.body.classList.remove('shelf-open', 'settings-open');
  $('settingsPanel').setAttribute('aria-hidden', 'true');
}

function applySettings() {
  document.documentElement.style.setProperty('--reader-size', `${state.settings.fontSize}px`);
  document.documentElement.style.setProperty('--reader-line', String(state.settings.lineHeight / 10));
  document.documentElement.style.setProperty('--reader-width', `${state.settings.readerWidth}px`);
  document.body.classList.toggle('night', state.settings.theme === 'night');
  document.body.classList.toggle('green', state.settings.theme === 'green');
  $('fontSize').value = state.settings.fontSize;
  $('lineHeight').value = state.settings.lineHeight;
  $('fontSizeValue').textContent = `${state.settings.fontSize}px`;
  $('lineHeightValue').textContent = (state.settings.lineHeight / 10).toFixed(1);
  $('readerWidth').value = state.settings.readerWidth;
  $('themeSelect').value = state.settings.theme;
  $('fullscreenToggle').textContent = document.fullscreenElement ? UI.exitFullscreen : UI.enterFullscreen;
  updateScrollProgress();
}

function updateSetting(key, value) {
  state.settings[key] = value;
  saveSettings();
  applySettings();
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
  else await document.exitFullscreen?.();
  applySettings();
}

$('bookList').addEventListener('click', (event) => {
  const chapterItem = event.target.closest('[data-chapter-id]');
  if (chapterItem) selectChapter(chapterItem.dataset.bookId, chapterItem.dataset.chapterId);
});
$('chapterSelect').addEventListener('change', (event) => selectChapter(state.activeBookId, event.target.value, false));
$('search').addEventListener('input', (event) => {
  state.query = event.target.value;
  renderShelf();
});
$('prevChapter').addEventListener('click', () => switchChapter(-1));
$('nextChapter').addEventListener('click', () => switchChapter(1));
$('topButton').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
$('openShelf').addEventListener('click', () => document.body.classList.add('shelf-open'));
$('closeShelf').addEventListener('click', closeOverlays);
$('scrim').addEventListener('click', closeOverlays);
$('chapterMenu').addEventListener('click', () => document.body.classList.add('shelf-open'));
$('openSettings').addEventListener('click', openSettings);
$('closeSettings').addEventListener('click', closeOverlays);
$('fullscreenBtn').addEventListener('click', toggleFullscreen);
$('fullscreenToggle').addEventListener('click', toggleFullscreen);
$('fontSize').addEventListener('input', (event) => updateSetting('fontSize', Number(event.target.value)));
$('lineHeight').addEventListener('input', (event) => updateSetting('lineHeight', Number(event.target.value)));
$('readerWidth').addEventListener('input', (event) => updateSetting('readerWidth', Number(event.target.value)));
$('themeSelect').addEventListener('change', (event) => updateSetting('theme', event.target.value));
$('commentForm').addEventListener('submit', submitComment);
window.addEventListener('scroll', updateScrollProgress, { passive: true });
window.addEventListener('beforeunload', saveLastRead);
document.addEventListener('fullscreenchange', applySettings);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeOverlays();
  if (event.key === 'ArrowLeft') switchChapter(-1);
  if (event.key === 'ArrowRight') switchChapter(1);
});

applySettings();
loadLibrary().catch(() => {
  $('reader').innerHTML = `<div class="empty">${UI.loadFailed}</div>`;
});
