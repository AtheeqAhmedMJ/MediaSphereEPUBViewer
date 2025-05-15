// renderer.js - Full Apple Books style reader logic with 3-theme toggle and pagination

// Global book state
let book = {
  zip: null,
  contents: [],
  toc: [],
  currentIndex: 0,
  rootFolder: '',
  metadata: {
    title: '',
    creator: '',
    language: '',
    publisher: '',
    description: ''
  },
  loaded: false
};

// UI State
let currentFontSize = 18;
let themeModes = ['light', 'dark', 'sepia'];
let currentThemeIndex = 0;
let isScrolling = false;
let totalPages = 1;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  initializeUI();
  initializeEventListeners();
  loadUserPreferences();
});

function initializeUI() {
  const savedTheme = localStorage.getItem('theme');
  currentThemeIndex = savedTheme ? themeModes.indexOf(savedTheme) : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 1 : 0);
  if (currentThemeIndex === -1) currentThemeIndex = 0;

  document.documentElement.setAttribute('data-theme', themeModes[currentThemeIndex]);
  currentFontSize = parseInt(localStorage.getItem('fontSize')) || 18;

  const contentEl = document.getElementById('content');
  contentEl.style.fontSize = `${currentFontSize}px`;
  document.getElementById('fontSizeDisplay').textContent = `${currentFontSize}px`;

  updateThemeIcon();
}

function initializeEventListeners() {
  document.getElementById('toggleTocBtn').addEventListener('click', toggleTOC);
  document.querySelector('.close-toc').addEventListener('click', toggleTOC);
  document.getElementById('themeToggle').addEventListener('click', cycleTheme);
  document.getElementById('content').addEventListener('scroll', handleScroll);
  document.getElementById('prevButton').addEventListener('click', prevChapter);
  document.getElementById('nextButton').addEventListener('click', nextChapter);

  document.addEventListener('click', (e) => {
    const toc = document.getElementById('toc');
    const tocBtn = document.getElementById('toggleTocBtn');
    if (!toc.contains(e.target) && !tocBtn.contains(e.target)) {
      if (window.innerWidth < 768 && !toc.classList.contains('toc-closed')) toggleTOC();
    }
  });
}

function loadUserPreferences() {
  // Font size and theme loaded in initializeUI()
}

function saveUserPreferences() {
  localStorage.setItem('fontSize', currentFontSize);
  localStorage.setItem('theme', themeModes[currentThemeIndex]);
}

function cycleTheme() {
  currentThemeIndex = (currentThemeIndex + 1) % themeModes.length;
  document.documentElement.setAttribute('data-theme', themeModes[currentThemeIndex]);
  updateThemeIcon();
  saveUserPreferences();
  updatePageInfo();
}

function updateThemeIcon() {
  const themeIcon = document.querySelector('#themeToggle i');
  switch (themeModes[currentThemeIndex]) {
    case 'light':
      themeIcon.className = 'fas fa-moon';
      break;
    case 'dark':
      themeIcon.className = 'fas fa-sun';
      break;
    case 'sepia':
      themeIcon.className = 'fas fa-adjust';
      break;
  }
}

function zoomIn() {
  currentFontSize = Math.min(currentFontSize + 2, 32);
  updateFontSize();
}

function zoomOut() {
  currentFontSize = Math.max(currentFontSize - 2, 12);
  updateFontSize();
}

function updateFontSize() {
  const contentEl = document.getElementById('content');
  contentEl.style.fontSize = `${currentFontSize}px`;
  document.getElementById('fontSizeDisplay').textContent = `${currentFontSize}px`;
  saveUserPreferences();
  updatePageInfo();
}

function toggleTOC() {
  const toc = document.getElementById('toc');
  toc.classList.toggle('toc-closed');
  if (!toc.classList.contains('toc-closed')) {
    toc.classList.add('toc-opening');
    setTimeout(() => toc.classList.remove('toc-opening'), 300);
  }
}

function handleScroll() {
  if (!isScrolling) {
    isScrolling = true;
    requestAnimationFrame(() => {
      updateProgressBar();
      isScrolling = false;
    });
  }
}

function updateProgressBar() {
  if (!book.loaded) return;
  const content = document.getElementById('content');
  const scrollTop = content.scrollTop;
  const scrollHeight = content.scrollHeight - content.clientHeight;
  const percent = (scrollTop / scrollHeight) * 100;
  document.getElementById('progressBar').style.width = `${percent.toFixed(2)}%`;
  updatePageInfo();
}

// Page info accounting for two-column layout
function updatePageInfo() {
  if (!book.loaded) {
    document.getElementById('pageInfo').textContent = 'Page -/-';
    return;
  }
  const content = document.getElementById('content');
  const scrollTop = content.scrollTop;
  const clientHeight = content.clientHeight;
  const scrollHeight = content.scrollHeight;

  // For two columns, pages = total scroll height / viewport height, rounded up
  totalPages = Math.max(1, Math.ceil(scrollHeight / clientHeight));
  const currentPage = Math.min(totalPages, Math.max(1, Math.ceil(scrollTop / clientHeight) + 1));
  document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${totalPages}`;
}

function prevChapter() {
  if (book.currentIndex > 0) loadChapter(book.currentIndex - 1);
}

function nextChapter() {
  if (book.currentIndex < book.contents.length - 1) loadChapter(book.currentIndex + 1);
}

// --- EPUB Loading and Parsing ---

// Adapt your existing loadEpub and parseEpub functions here

async function loadEpub() {
  const fileInput = document.getElementById('fileInput');
  if (fileInput.files.length === 0) return;

  const file = fileInput.files[0];
  showLoadingOverlay(`Loading ${file.name}...`);
  hideErrorMessage();

  document.getElementById('content').innerHTML = '';
  document.getElementById('tocContent').innerHTML = '<p class="toc-empty">Processing contents...</p>';
  document.getElementById('prevButton').disabled = true;
  document.getElementById('nextButton').disabled = true;
  document.getElementById('pageInfo').textContent = 'Page -/-';

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      await parseEpub(e.target.result);
    } catch (error) {
      showErrorMessage(`Error loading EPUB: ${error.message}`);
      console.error('EPUB loading error:', error);
    } finally {
      hideLoadingOverlay();
    }
  };
  reader.onerror = () => {
    hideLoadingOverlay();
    showErrorMessage('Failed to read the file');
  };
  reader.readAsArrayBuffer(file);
}

async function parseEpub(data) {
  // Reset book object
  book = {
    zip: null,
    contents: [],
    toc: [],
    currentIndex: 0,
    rootFolder: '',
    metadata: {
      title: '',
      creator: '',
      language: '',
      publisher: '',
      description: ''
    },
    loaded: false
  };

  book.zip = await JSZip.loadAsync(data);

  const containerFile = book.zip.file('META-INF/container.xml');
  if (!containerFile) throw new Error('Invalid EPUB: Missing container.xml');

  const containerXML = await containerFile.async('text');
  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXML, 'application/xml');
  const rootFilePath = containerDoc.querySelector('rootfile').getAttribute('full-path');

  book.rootFolder = rootFilePath.split('/').slice(0, -1).join('');
  if (book.rootFolder.length > 0) book.rootFolder += '/';

  const opfFile = book.zip.file(rootFilePath);
  if (!opfFile) throw new Error('Invalid EPUB: Missing OPF file');

  const opf = await opfFile.async('text');
  const opfDoc = parser.parseFromString(opf, 'application/xml');

  extractMetadata(opfDoc);

  // Manifest and spine parsing
  const manifest = {};
  opfDoc.querySelectorAll('manifest > item').forEach(item => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    const mediaType = item.getAttribute('media-type');
    const props = item.getAttribute('properties') || '';
    manifest[id] = { id, href, mediaType, properties: props };
  });

  book.contents = [];
  opfDoc.querySelectorAll('spine > itemref').forEach(itemref => {
    const idref = itemref.getAttribute('idref');
    if (manifest[idref]) {
      book.contents.push({
        id: idref,
        href: book.rootFolder + manifest[idref].href,
        mediaType: manifest[idref].mediaType
      });
    }
  });

  await loadCoverImage(manifest);

  await loadTOC(opfDoc, manifest);

  renderToc();
  updateUIControls();

  if (book.contents.length > 0) {
    await loadChapter(0);
    book.loaded = true;
  } else {
    throw new Error('No readable content found in EPUB');
  }
}

function extractMetadata(opfDoc) {
  const titleElement = opfDoc.querySelector('metadata > dc\\:title, metadata > *|title');
  if (titleElement) book.metadata.title = titleElement.textContent.trim();

  const creatorElement = opfDoc.querySelector('metadata > dc\\:creator, metadata > *|creator');
  if (creatorElement) book.metadata.creator = creatorElement.textContent.trim();

  const languageElement = opfDoc.querySelector('metadata > dc\\:language, metadata > *|language');
  if (languageElement) book.metadata.language = languageElement.textContent.trim();

  const publisherElement = opfDoc.querySelector('metadata > dc\\:publisher, metadata > *|publisher');
  if (publisherElement) book.metadata.publisher = publisherElement.textContent.trim();

  const descriptionElement = opfDoc.querySelector('metadata > dc\\:description, metadata > *|description');
  if (descriptionElement) book.metadata.description = descriptionElement.textContent.trim();

  document.getElementById('bookTitle').textContent = book.metadata.title || 'Untitled Book';
  document.getElementById('bookAuthor').textContent = book.metadata.creator || 'Unknown Author';
}

async function loadCoverImage(manifest) {
  let coverHref = '';

  for (const id in manifest) {
    if (manifest[id].properties && manifest[id].properties.includes('cover-image')) {
      coverHref = book.rootFolder + manifest[id].href;
      break;
    }
  }
  if (!coverHref) {
    for (const id in manifest) {
      if (id === 'cover' || id.toLowerCase().includes('cover')) {
        if (manifest[id].mediaType && manifest[id].mediaType.startsWith('image/')) {
          coverHref = book.rootFolder + manifest[id].href;
          break;
        }
      }
    }
  }
  if (coverHref) {
    try {
      const coverFile = book.zip.file(coverHref);
      if (coverFile) {
        const blob = await coverFile.async('blob');
        const url = URL.createObjectURL(blob);
        const coverThumb = document.getElementById('coverThumb');
        coverThumb.style.backgroundImage = `url(${url})`;
        coverThumb.classList.add('has-cover');
      }
    } catch (e) {
      console.error('Error loading cover image:', e);
    }
  }
}

async function loadTOC(opfDoc, manifest) {
  let tocPath = '';
  for (const id in manifest) {
    if (manifest[id].properties && manifest[id].properties.includes('nav')) {
      tocPath = book.rootFolder + manifest[id].href;
      break;
    }
  }
  if (!tocPath) {
    let tocId = opfDoc.querySelector('spine')?.getAttribute('toc');
    if (tocId && manifest[tocId]) {
      tocPath = book.rootFolder + manifest[tocId].href;
    } else {
      for (const id in manifest) {
        if (manifest[id].mediaType === 'application/x-dtbncx+xml') {
          tocPath = book.rootFolder + manifest[id].href;
          break;
        }
      }
    }
  }
  if (tocPath) {
    try {
      const tocFile = book.zip.file(tocPath);
      if (!tocFile) throw new Error('TOC file not found');

      const tocContent = await tocFile.async('text');
      const parser = new DOMParser();
      const tocDoc = parser.parseFromString(tocContent, 'application/xml');
      book.toc = [];

      const navItems = tocDoc.querySelectorAll('nav[*|type="toc"] li a, nav[role="doc-toc"] li a');
      if (navItems.length > 0) {
        navItems.forEach(navItem => {
          const title = navItem.textContent.trim();
          let href = navItem.getAttribute('href');
          if (href) {
            let hrefParts = href.split('#');
            let filePath = hrefParts[0];
            if (filePath === '') {
              const lastToc = book.toc[book.toc.length - 1];
              if (lastToc) filePath = lastToc.href.split('#')[0];
            }
            const fullHref = filePath ? book.rootFolder + filePath : '';
            const index = book.contents.findIndex(item => item.href === fullHref);
            book.toc.push({
              title,
              href: fullHref,
              fragment: hrefParts[1] || null,
              index: index >= 0 ? index : 0,
              level: getElementLevel(navItem.parentElement)
            });
          }
        });
      } else {
        const navPoints = tocDoc.querySelectorAll('navPoint');
        if (navPoints.length > 0) {
          navPoints.forEach(navPoint => {
            const title = navPoint.querySelector('navLabel text')?.textContent.trim();
            const content = navPoint.querySelector('content');
            if (title && content) {
              let href = content.getAttribute('src');
              if (href) {
                const hrefParts = href.split('#');
                const filePath = hrefParts[0];
                const fullHref = book.rootFolder + filePath;
                const index = book.contents.findIndex(item => item.href === fullHref);
                book.toc.push({
                  title,
                  href: fullHref,
                  fragment: hrefParts[1] || null,
                  index: index >= 0 ? index : 0,
                  level: parseInt(navPoint.getAttribute('playOrder') || '1')
                });
              }
            }
          });
        }
      }
      if (book.toc.length === 0) {
        book.toc = book.contents.map((item, index) => ({
          title: `Chapter ${index + 1}`,
          href: item.href,
          fragment: null,
          index,
          level: 1
        }));
      }
    } catch (e) {
      console.error('Error loading TOC:', e);
      book.toc = book.contents.map((item, index) => ({
        title: `Chapter ${index + 1}`,
        href: item.href,
        fragment: null,
        index,
        level: 1
      }));
    }
  } else {
    book.toc = book.contents.map((item, index) => ({
      title: `Chapter ${index + 1}`,
      href: item.href,
      fragment: null,
      index,
      level: 1
    }));
  }
}

function getElementLevel(element) {
  let level = 1;
  let current = element;
  while (current && current.tagName !== 'NAV') {
    if (current.tagName === 'LI') {
      const parentUl = current.parentElement;
      if (parentUl && parentUl.tagName === 'UL' && parentUl.parentElement && parentUl.parentElement.tagName === 'LI') {
        level++;
      }
    }
    current = current.parentElement;
  }
  return level;
}

function renderToc() {
  const tocContent = document.getElementById('tocContent');
  tocContent.innerHTML = '';
  if (book.toc.length === 0) {
    tocContent.innerHTML = '<p class="toc-empty">No chapters found</p>';
    return;
  }
  const tocList = document.createElement('ul');
  tocList.className = 'toc-list';
  book.toc.forEach(item => {
    const li = document.createElement('li');
    li.className = `toc-item level-${item.level || 1}`;
    const link = document.createElement('a');
    link.textContent = item.title;
    link.href = '#';
    link.setAttribute('data-index', item.index);
    link.addEventListener('click', (e) => {
      e.preventDefault();
      loadChapter(item.index, item.fragment);
      if (window.innerWidth < 768) toggleTOC();
    });
    li.appendChild(link);
    tocList.appendChild(li);
  });
  tocContent.appendChild(tocList);
}

function updateUIControls() {
  document.getElementById('prevButton').disabled = book.currentIndex <= 0;
  document.getElementById('nextButton').disabled = book.currentIndex >= book.contents.length - 1;
  updatePageInfo();
  updateProgressBar();
  updateActiveTocItem();
}

function updateActiveTocItem() {
  const currentActive = document.querySelector('.toc-item.active');
  if (currentActive) currentActive.classList.remove('active');
  const tocItems = document.querySelectorAll('.toc-item a');
  tocItems.forEach(item => {
    const index = parseInt(item.getAttribute('data-index'));
    if (index === book.currentIndex) {
      item.parentElement.classList.add('active');
    }
  });
}

async function loadChapter(index, fragment = null) {
  if (!book.loaded || index < 0 || index >= book.contents.length) return;

  showLoadingOverlay('Loading chapter...');

  try {
    book.currentIndex = index;
    const chapter = book.contents[index];
    const chapterFile = book.zip.file(chapter.href);
    if (!chapterFile) throw new Error(`Chapter file not found: ${chapter.href}`);

    const content = await chapterFile.async('text');
    const contentElement = document.getElementById('content');
    const parser = new DOMParser();
    const chapterDoc = parser.parseFromString(content, 'text/html');
    let bodyContent = chapterDoc.body ? chapterDoc.body.innerHTML : content;

    contentElement.innerHTML = sanitizeAndProcessHtml(bodyContent);
    fixImagePaths(chapter.href);
    fixCssPaths(chapter.href);

    if (fragment) {
      const target = document.getElementById(fragment) || document.querySelector(`[name="${fragment}"]`);
      if (target) {
        setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      } else {
        contentElement.scrollTop = 0;
      }
    } else {
      contentElement.scrollTop = 0;
    }

    updateUIControls();

  } catch (e) {
    console.error('Error loading chapter:', e);
    showErrorMessage(`Error loading chapter: ${e.message}`);
  } finally {
    hideLoadingOverlay();
  }
}

function sanitizeAndProcessHtml(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '');
}

function fixImagePaths(chapterPath) {
  const basePath = chapterPath.split('/').slice(0, -1).join('/');
  const images = document.querySelectorAll('#content img');
  images.forEach(async (img) => {
    try {
      let src = img.getAttribute('src');
      if (!src) return;
      if (!src.startsWith('http') && !src.startsWith('data:')) {
        const normalizedSrc = src.replace(/^\.\//, '');
        const absoluteSrc = basePath ? `${basePath}/${normalizedSrc}`.replace(/\/\.\.\//, '/') : normalizedSrc;
        const imageFile = book.zip.file(absoluteSrc);
        if (imageFile) {
          const blob = await imageFile.async('blob');
          const url = URL.createObjectURL(blob);
          img.src = url;
          img.classList.add('loading');
          img.onload = () => img.classList.remove('loading');
        }
      }
    } catch (e) {
      console.error('Error fixing image path:', e);
    }
  });
}

function fixCssPaths(chapterPath) {
  const basePath = chapterPath.split('/').slice(0, -1).join('/');
  const links = document.querySelectorAll('#content link[rel="stylesheet"]');
  links.forEach(async (link) => {
    try {
      let href = link.getAttribute('href');
      if (!href) return;
      if (!href.startsWith('http')) {
        const normalizedHref = href.replace(/^\.\//, '');
        const absoluteHref = basePath ? `${basePath}/${normalizedHref}`.replace(/\/\.\.\//, '/') : normalizedHref;
        const cssFile = book.zip.file(absoluteHref);
        if (cssFile) {
          const css = await cssFile.async('text');
          const style = document.createElement('style');
          style.textContent = css;
          document.head.appendChild(style);
          link.remove();
        }
      }
    } catch (e) {
      console.error('Error fixing CSS path:', e);
    }
  });
}

// Loading overlay
function showLoadingOverlay(message = 'Loading...') {
  const overlay = document.getElementById('loadingOverlay');
  document.getElementById('loadingText').textContent = message;
  overlay.style.display = 'flex';
}
function hideLoadingOverlay() {
  document.getElementById('loadingOverlay').style.display = 'none';
}

// Error message
function showErrorMessage(message) {
  const errorElement = document.getElementById('errorMessage');
  errorElement.textContent = message;
  errorElement.style.display = 'block';

  setTimeout(() => {
    errorElement.style.opacity = '0';
    setTimeout(() => {
      errorElement.style.display = 'none';
      errorElement.style.opacity = '1';
    }, 300);
  }, 5000);
}
function hideErrorMessage() {
  document.getElementById('errorMessage').style.display = 'none';
}
