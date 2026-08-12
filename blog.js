const osBlogApp = document.querySelector('#osBlogApp');

if (osBlogApp) {
  const defaultDocumentTitle = document.title;
  const defaultDescription = document.querySelector('meta[name="description"]')?.content || '';
  const repo = osBlogApp.dataset.repo;
  const apiBase = `https://api.github.com/repos/${repo}`;
  const cacheKey = `lightwind-os-issues:${repo}`;
  const pageSize = 15;
  const state = { posts: [], query: '', tag: '全部', page: 1, currentPost: null, source: '内置文章' };

  const listView = document.querySelector('#osBlogListView');
  const postView = document.querySelector('#osBlogPostView');
  const postList = document.querySelector('#osPostList');
  const filter = document.querySelector('#osBlogFilter');
  const status = document.querySelector('#osBlogStatus');
  const pagination = document.querySelector('#osBlogPagination');
  const searchTools = document.querySelector('#osBlogTools');
  const searchForm = document.querySelector('#osBlogSearch');
  const searchInput = document.querySelector('#osSearchInput');
  const sourceState = document.querySelector('#osBlogSourceState');
  const pageElement = document.querySelector('.page-os');

  function utterancesTheme() {
    return document.documentElement.dataset.theme === 'light' ? 'github-light' : 'github-dark-orange';
  }

  const fallbackPosts = [
    {
      id: 'welcome', title: '欢迎来到轻风雨斜 OS', date: '2026-08-12', labels: ['置顶', '系统'], comments: 0,
      body: `## 这是什么？\n\n这是我的个人系统，也是一个由 GitHub Issues 驱动的单页博客。这里记录正在构建的东西、踩过的坑，以及那些值得留下来的念头。\n\n> 慢一点没有关系，重要的是保持好奇，并且不要停下来。\n\n## 如何发布文章\n\n1. 打开本站 GitHub 仓库的 Issues。\n2. 新建一个 Issue，把标题作为文章标题。\n3. 使用 Markdown 编写正文，并至少添加一个标签。\n4. 保存后刷新本页，文章就会自动出现。\n\n## 当前能力\n\n- GitHub Issues 数据源\n- 标签筛选、全文搜索和分页\n- Markdown 正文、文章目录与代码复制\n- URL 直达、上一篇/下一篇和 Utterances 评论\n- RSS 订阅与离线回退\n\n\`\`\`js\nconsole.log('Welcome to Lightwind OS');\n\`\`\``
    },
    {
      id: 'build-homepage', title: '从一个空仓库开始，搭建自己的主页', date: '2026-08-11', labels: ['开发', 'GitHub Pages'], comments: 0,
      body: `## 从零开始\n\n个人网站最迷人的地方，是它不需要服从平台预设的形状。一个 \`index.html\`、一份样式和少量脚本，就可以成为自己的互联网住址。\n\n## 部署流程\n\n- 建立 GitHub Pages 仓库。\n- 提交静态文件。\n- 配置自定义域名与 HTTPS。\n- 每次推送后等待 Pages 完成部署。\n\n## 缓存策略\n\n静态资源地址增加版本参数，可以让浏览器更快发现新版本：\n\n\`\`\`html\n<link rel="stylesheet" href="./styles.css?v=20260812" />\n\`\`\`\n\n网站并不需要一次完成。先让它上线，再让它慢慢长成自己的样子。`
    },
    {
      id: 'personal-system', title: '我的个人系统：先做出来，再慢慢变好', date: '2026-08-08', labels: ['系统', '思考'], comments: 0,
      body: `## 先完成闭环\n\n想法只有经过制作、发布和反馈，才真正成为一个可以迭代的对象。\n\n## 三条原则\n\n1. **先做出来。** 不让完美主义阻止第一步。\n2. **保持好奇。** 学习真正需要的东西，而不是盲目追赶。\n3. **服务生活。** 工具应该节省注意力，而不是制造更多负担。\n\n## 版本不是终点\n\n每一次发布只是一个时间切片。允许今天的作品不完美，才有机会看到它明天的变化。`
    },
    {
      id: 'automation', title: '把重复的事情交给代码', date: '2026-08-05', labels: ['开发', '自动化'], comments: 0,
      body: `## 识别重复\n\n当一件事情第三次以相同方式发生，就值得停下来问一句：它能不能被自动化？\n\n## 一个简单判断\n\n| 问题 | 适合自动化 |\n| --- | --- |\n| 步骤是否稳定 | 是 |\n| 是否经常重复 | 是 |\n| 出错代价是否可控 | 是 |\n\n自动化并不一定是大型系统。一个脚本、一条 Git Hook，甚至一段浏览器代码，都可能把注意力还给更重要的事情。`
    },
    {
      id: 'ai-life', title: '和 AI 一起学习、写作与做项目', date: '2026-08-03', labels: ['AI', '开发'], comments: 0,
      body: `## AI 是协作者\n\n好的协作不是把判断全部交出去，而是更快地产生草稿、验证假设并发现盲点。\n\n## 我的使用方式\n\n- 先描述目标和约束。\n- 要求给出可验证的结果。\n- 阅读差异，而不是直接接受。\n- 把真正有价值的流程沉淀下来。\n\n> 工具会变化，判断力仍然属于自己。`
    },
    {
      id: 'leave-space', title: '给生活留一点空白', date: '2026-08-01', labels: ['生活'], comments: 0,
      body: `## 空白不是浪费\n\n没有被日程填满的时间，常常是想法真正浮现的地方。\n\n散步、阅读、发呆，或者只是把手机放远一点。这些看似没有产出的时刻，会悄悄改变之后的选择。\n\n**生活不是等待编译完成的程序。** 有些片段不需要输出，也依然有意义。`
    }
  ];

  function normalizeIssue(issue) {
    const labelColors = {};
    (issue.labels || []).forEach((label) => {
      if (typeof label !== 'string' && label?.name && label?.color) labelColors[label.name] = `#${label.color}`;
    });
    return {
      id: `issue-${issue.number}`,
      number: issue.number,
      title: issue.title,
      body: issue.body || '*这篇文章暂时没有正文。*',
      bodyHtml: issue.body_html || '',
      date: (issue.created_at || '').slice(0, 10),
      updated: (issue.updated_at || '').slice(0, 10),
      comments: issue.comments || 0,
      labels: (issue.labels || []).map((label) => typeof label === 'string' ? label : label.name).filter(Boolean),
      labelColors,
      sourceUrl: issue.html_url,
      author: issue.user?.login || 'QingFengYuXie'
    };
  }

  function sortedPosts(posts) {
    return [...posts].sort((a, b) => {
      const pinnedA = a.labels.some((label) => /^(置顶|pinned)$/i.test(label));
      const pinnedB = b.labels.some((label) => /^(置顶|pinned)$/i.test(label));
      return Number(pinnedB) - Number(pinnedA) || b.date.localeCompare(a.date);
    });
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  }

  function safeUrl(value = '') {
    try {
      const url = new URL(value, window.location.href);
      return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : '#';
    } catch {
      return '#';
    }
  }

  const iconPaths = {
    post: 'M0 3.75C0 2.784.784 2 1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25Zm1.75-.25a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25ZM3.5 6.75A.75.75 0 0 1 4.25 6h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75Zm0 3A.75.75 0 0 1 4.25 9h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75Z',
    pinned: 'M8.75 1.75a.75.75 0 0 0-1.5 0v6.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44ZM2.5 10a.75.75 0 0 0-1.5 0v3.25C1 14.216 1.784 15 2.75 15h10.5A1.75 1.75 0 0 0 15 13.25V10a.75.75 0 0 0-1.5 0v3.25a.25.25 0 0 1-.25.25H2.75a.25.25 0 0 1-.25-.25Z',
    comment: 'M1.75 1h12.5C15.216 1 16 1.784 16 2.75v8.5A1.75 1.75 0 0 1 14.25 13H7.5l-3.876 2.907A1 1 0 0 1 2 15.107V13h-.25A1.75 1.75 0 0 1 0 11.25v-8.5C0 1.784.784 1 1.75 1Z'
  };

  const knownLabelColors = {
    '置顶': '#d73a4a', pinned: '#d73a4a', '系统': '#8250df', '开发': '#d93f0b',
    '生活': '#1a7f37', '思考': '#bf8700', '自动化': '#0969da', AI: '#db61a2',
    'GitHub Pages': '#8250df', '软件': '#d93f0b', '日常': '#5767f2', '硬件': '#1a7f37'
  };
  const fallbackLabelColors = ['#0969da', '#8250df', '#1a7f37', '#d93f0b', '#bf8700', '#db61a2', '#006b75'];
  const yearColors = ['#bc4c00', '#0969da', '#1f883d', '#a333d0'];

  function colorForLabel(post, label) {
    if (post?.labelColors?.[label]) return post.labelColors[label];
    if (knownLabelColors[label]) return knownLabelColors[label];
    const hash = [...label].reduce((total, character) => total + character.codePointAt(0), 0);
    return fallbackLabelColors[hash % fallbackLabelColors.length];
  }

  function colorForDate(date = '') {
    const year = Number(date.slice(0, 4)) || new Date().getFullYear();
    return yearColors[Math.abs(year) % yearColors.length];
  }

  function inlineMarkdown(value = '') {
    const tokens = [];
    const token = (html) => {
      const key = `\u0000${tokens.length}\u0000`;
      tokens.push(html);
      return key;
    };
    let output = escapeHtml(value);
    output = output.replace(/`([^`]+)`/g, (_, code) => token(`<code>${code}</code>`));
    output = output.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (_, alt, url) => token(`<img src="${escapeHtml(safeUrl(url))}" alt="${alt}" loading="lazy" />`));
    output = output.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => token(`<a href="${escapeHtml(safeUrl(url))}" target="_blank" rel="noreferrer">${label}</a>`));
    output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    output = output.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    output = output.replace(/(^|\s)\*([^*]+)\*(?=\s|$)/g, '$1<em>$2</em>');
    output = output.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)]);
    return output;
  }

  function slugify(text, used) {
    const base = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'section';
    let slug = base;
    let count = 2;
    while (used.has(slug)) slug = `${base}-${count++}`;
    used.add(slug);
    return slug;
  }

  function markdownToHtml(markdown = '') {
    const lines = String(markdown).replace(/\r/g, '').split('\n');
    const html = [];
    const usedSlugs = new Set();
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) { index += 1; continue; }
      const fence = line.match(/^```([\w-]*)\s*$/);
      if (fence) {
        const code = [];
        index += 1;
        while (index < lines.length && !/^```\s*$/.test(lines[index])) code.push(lines[index++]);
        index += 1;
        html.push(`<div class="os-code"><span>${escapeHtml(fence[1] || 'text')}</span><button type="button">复制</button><pre><code>${escapeHtml(code.join('\n'))}</code></pre></div>`);
        continue;
      }
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = Math.min(heading[1].length + 1, 6);
        const plain = heading[2].replace(/[*_`~\[\]]/g, '');
        const slug = slugify(plain, usedSlugs);
        html.push(`<h${level} id="${slug}">${inlineMarkdown(heading[2])}</h${level}>`);
        index += 1;
        continue;
      }
      if (/^---+$/.test(line.trim())) { html.push('<hr />'); index += 1; continue; }
      if (/^>\s?/.test(line)) {
        const quote = [];
        while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ''));
        html.push(`<blockquote>${quote.map(inlineMarkdown).join('<br />')}</blockquote>`);
        continue;
      }
      if (/^[-*+]\s+/.test(line)) {
        const items = [];
        while (index < lines.length && /^[-*+]\s+/.test(lines[index])) {
          const item = lines[index++].replace(/^[-*+]\s+/, '');
          const task = item.match(/^\[([ xX])\]\s+(.+)$/);
          items.push(task ? `<li class="task"><input type="checkbox" disabled ${task[1].toLowerCase() === 'x' ? 'checked' : ''} />${inlineMarkdown(task[2])}</li>` : `<li>${inlineMarkdown(item)}</li>`);
        }
        html.push(`<ul>${items.join('')}</ul>`);
        continue;
      }
      if (/^\d+\.\s+/.test(line)) {
        const items = [];
        while (index < lines.length && /^\d+\.\s+/.test(lines[index])) items.push(`<li>${inlineMarkdown(lines[index++].replace(/^\d+\.\s+/, ''))}</li>`);
        html.push(`<ol>${items.join('')}</ol>`);
        continue;
      }
      if (index + 1 < lines.length && /\|/.test(line) && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) {
        const splitRow = (row) => row.replace(/^\s*\||\|\s*$/g, '').split('|').map((cell) => cell.trim());
        const headers = splitRow(line);
        index += 2;
        const rows = [];
        while (index < lines.length && /\|/.test(lines[index]) && lines[index].trim()) rows.push(splitRow(lines[index++]));
        html.push(`<div class="os-table-wrap"><table><thead><tr>${headers.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      const paragraph = [line.trim()];
      index += 1;
      while (index < lines.length && lines[index].trim() && !/^(#{1,6})\s|^```|^>|^[-*+]\s+|^\d+\.\s+|^---+$/.test(lines[index])) paragraph.push(lines[index++].trim());
      html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
    }
    return html.join('');
  }

  function filteredPosts() {
    const query = state.query.trim().toLowerCase();
    return state.posts.filter((post) => {
      const tagMatch = state.tag === '全部' || post.labels.includes(state.tag);
      const haystack = `${post.title}\n${post.body}\n${post.labels.join(' ')}`.toLowerCase();
      return tagMatch && (!query || haystack.includes(query));
    });
  }

  function labelCounts() {
    const counts = new Map([['全部', state.posts.length]]);
    state.posts.forEach((post) => post.labels.forEach((label) => counts.set(label, (counts.get(label) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => a[0] === '全部' ? -1 : b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'));
  }

  function updateUrl(changes, mode = 'push') {
    const url = new URL(window.location.href);
    Object.entries(changes).forEach(([key, value]) => {
      if (value === '' || value === null || value === undefined || value === 1 || value === '全部') url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    });
    url.searchParams.set('page', '2');
    window.history[mode === 'replace' ? 'replaceState' : 'pushState']({}, '', url);
  }

  function renderFilters() {
    filter.innerHTML = labelCounts().map(([label, count]) => {
      const color = label === '全部' ? '#24292f' : colorForLabel(null, label);
      return `<button class="${state.tag === label ? 'active' : ''}" style="background-color:${color}" type="button" data-tag="${escapeHtml(label)}">${escapeHtml(label)} <b>${String(count).padStart(2, '0')}</b></button>`;
    }).join('');
  }

  function renderPagination(totalPages) {
    if (totalPages <= 1) { pagination.innerHTML = ''; return; }
    const buttons = [];
    buttons.push(`<button type="button" data-blog-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>上一页</button>`);
    for (let page = 1; page <= totalPages; page += 1) buttons.push(`<button class="${page === state.page ? 'active' : ''}" type="button" data-blog-page="${page}">${page}</button>`);
    buttons.push(`<button type="button" data-blog-page="${state.page + 1}" ${state.page === totalPages ? 'disabled' : ''}>下一页</button>`);
    pagination.innerHTML = buttons.join('');
  }

  function renderList() {
    const posts = filteredPosts();
    const totalPages = Math.max(1, Math.ceil(posts.length / pageSize));
    state.page = Math.min(state.page, totalPages);
    const visible = posts.slice((state.page - 1) * pageSize, state.page * pageSize);
    renderFilters();
    status.textContent = posts.length ? `共 ${posts.length} 篇文章 · ${state.source}` : '没有找到符合条件的文章。';
    postList.innerHTML = visible.map((post) => {
      const pinned = post.labels.some((label) => /^(置顶|pinned)$/i.test(label));
      const comment = post.comments > 0 ? `<span class="gm-label comment-label"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="${iconPaths.comment}"/></svg>${post.comments}</span>` : '';
      const labels = post.labels.map((label) => `<span class="gm-label label-name" style="background-color:${colorForLabel(post, label)}">${escapeHtml(label)}</span>`).join('');
      return `<button class="os-post ${pinned ? 'pinned' : ''}" type="button" data-post-id="${escapeHtml(post.id)}" aria-label="阅读 ${escapeHtml(post.title)}"><span class="os-post-main"><span class="os-post-icon"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="${pinned ? iconPaths.pinned : iconPaths.post}"/></svg></span><span class="list-title">${escapeHtml(post.title)}</span></span><span class="list-labels">${comment}${labels}<time class="gm-label label-time" style="background-color:${colorForDate(post.date)}">${escapeHtml(post.date)}</time></span></button>`;
    }).join('');
    renderPagination(totalPages);
    sourceState.textContent = state.source;
  }

  function renderToc() {
    const headings = [...document.querySelectorAll('#osPostBody h2, #osPostBody h3')];
    const toc = document.querySelector('#osPostToc');
    if (!headings.length) { toc.innerHTML = ''; return; }
    toc.innerHTML = `<b>目录</b>${headings.map((heading) => `<a class="toc-${heading.tagName.toLowerCase()}" href="#${heading.id}">${escapeHtml(heading.textContent)}</a>`).join('')}`;
  }

  function enhanceRenderedArticle() {
    const body = document.querySelector('#osPostBody');
    const usedSlugs = new Set();
    body.querySelectorAll('h2, h3').forEach((heading) => {
      if (!heading.id) heading.id = slugify(heading.textContent, usedSlugs);
      else usedSlugs.add(heading.id);
    });
    body.querySelectorAll('a').forEach((link) => {
      link.target = '_blank';
      link.rel = 'noreferrer';
    });
    body.querySelectorAll('img').forEach((image) => { image.loading = 'lazy'; });
    body.querySelectorAll('pre').forEach((pre) => {
      if (pre.closest('.os-code')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'os-code';
      const language = pre.querySelector('code')?.className.match(/language-([\w-]+)/)?.[1] || 'code';
      wrapper.innerHTML = `<span>${escapeHtml(language)}</span><button type="button">复制</button>`;
      pre.before(wrapper);
      wrapper.append(pre);
    });
    body.querySelectorAll('table').forEach((table) => {
      if (table.parentElement.classList.contains('os-table-wrap')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'os-table-wrap';
      table.before(wrapper);
      wrapper.append(table);
    });
  }

  function renderNeighbors(post) {
    const index = state.posts.findIndex((item) => item.id === post.id);
    const previous = state.posts[index - 1];
    const next = state.posts[index + 1];
    document.querySelector('#osPostNeighbors').innerHTML = `${previous ? `<button type="button" data-post-id="${escapeHtml(previous.id)}"><span>上一篇</span>${escapeHtml(previous.title)}</button>` : '<span></span>'}${next ? `<button type="button" data-post-id="${escapeHtml(next.id)}"><span>下一篇</span>${escapeHtml(next.title)}</button>` : '<span></span>'}`;
  }

  function resetComments(post) {
    const comments = document.querySelector('#osComments');
    const button = document.querySelector('#osLoadComments');
    comments.innerHTML = '';
    button.hidden = false;
    button.disabled = false;
    button.textContent = `加载 GitHub 评论${post.comments ? ` (${post.comments})` : ''}`;
    const discussLink = document.querySelector('#osDiscussLink');
    discussLink.href = post.sourceUrl || `https://github.com/${repo}/issues/new?title=${encodeURIComponent(post.title)}`;
  }

  function openPost(id, updateHistory = true) {
    const post = state.posts.find((item) => item.id === id);
    if (!post) return;
    state.currentPost = post;
    osBlogApp.classList.add('is-post');
    listView.hidden = true;
    postView.hidden = false;
    document.querySelector('#osPostTitle').textContent = post.title;
    document.querySelector('#osPostLabels').innerHTML = post.labels.map((label) => `<span style="background-color:${colorForLabel(post, label)}">${escapeHtml(label)}</span>`).join('');
    document.querySelector('#osPostMeta').textContent = `${post.date}${post.updated && post.updated !== post.date ? ` · 更新于 ${post.updated}` : ''} · ${post.author || '轻风雨'} · ${post.comments} 条评论`;
    const source = document.querySelector('#osPostSource');
    source.href = post.sourceUrl || `https://github.com/${repo}/issues`;
    source.title = post.sourceUrl ? '查看原始 Issue' : '在 GitHub 中讨论';
    source.setAttribute('aria-label', source.title);
    document.querySelector('#osPostBody').innerHTML = post.bodyHtml || markdownToHtml(post.body);
    enhanceRenderedArticle();
    renderToc();
    renderNeighbors(post);
    resetComments(post);
    document.title = `${post.title} · 轻风雨斜 OS`;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = post.body.replace(/[#>*_`~|\[\]()!-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
    pageElement.scrollTo({ top: 0, behavior: 'smooth' });
    if (updateHistory) updateUrl({ post: post.id });
  }

  function closePost(updateHistory = true) {
    state.currentPost = null;
    osBlogApp.classList.remove('is-post');
    document.title = defaultDocumentTitle;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = defaultDescription;
    postView.hidden = true;
    listView.hidden = false;
    pageElement.scrollTo({ top: 0, behavior: 'smooth' });
    if (updateHistory) updateUrl({ post: null });
  }

  async function copyText(text, button) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    if (button) {
      if (button.classList.contains('gmeek-circle')) {
        const previousTitle = button.title;
        const previousLabel = button.getAttribute('aria-label');
        button.classList.add('is-copied');
        button.title = '已复制';
        button.setAttribute('aria-label', '已复制');
        window.setTimeout(() => {
          button.classList.remove('is-copied');
          button.title = previousTitle;
          button.setAttribute('aria-label', previousLabel || previousTitle);
        }, 1400);
        return;
      }
      const previous = button.textContent;
      button.textContent = '已复制';
      window.setTimeout(() => { button.textContent = previous; }, 1400);
    }
  }

  function loadComments() {
    if (!state.currentPost) return;
    const container = document.querySelector('#osComments');
    const button = document.querySelector('#osLoadComments');
    button.disabled = true;
    button.textContent = '正在加载评论…';
    const script = document.createElement('script');
    script.src = 'https://utteranc.es/client.js';
    script.setAttribute('repo', repo);
    if (state.currentPost.number) script.setAttribute('issue-number', String(state.currentPost.number));
    else script.setAttribute('issue-term', 'title');
    script.setAttribute('theme', utterancesTheme());
    script.setAttribute('crossorigin', 'anonymous');
    script.async = true;
    script.addEventListener('load', () => { button.hidden = true; });
    script.addEventListener('error', () => { button.disabled = false; button.textContent = '评论加载失败，点击重试'; });
    container.append(script);
  }

  document.addEventListener('themechange', ({ detail }) => {
    const frame = document.querySelector('#osComments iframe.utterances-frame');
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage({
      type: 'set-theme',
      theme: detail?.theme === 'light' ? 'github-light' : 'github-dark-orange'
    }, 'https://utteranc.es');
  });

  function restoreFromUrl() {
    const params = new URLSearchParams(window.location.search);
    state.query = params.get('q') || '';
    state.tag = params.get('tag') || '全部';
    state.page = Math.max(1, Number(params.get('blogPage')) || 1);
    searchInput.value = state.query;
    searchTools.hidden = !state.query && state.tag === '全部';
    renderList();
    const postId = params.get('post');
    if (postId) openPost(postId, false);
    else closePost(false);
  }

  async function loadPosts() {
    let cached = null;
    try {
      cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached?.items?.length) {
        state.posts = sortedPosts(cached.items);
        state.source = 'GitHub Issues 缓存';
        restoreFromUrl();
      }
    } catch {
      localStorage.removeItem(cacheKey);
    }
    try {
      const generatedResponse = await fetch(`./blog-data.json?v=${Date.now()}`, { cache: 'no-store' });
      if (generatedResponse.ok) {
        const generatedPosts = await generatedResponse.json();
        if (Array.isArray(generatedPosts) && generatedPosts.length) {
          state.posts = sortedPosts(generatedPosts);
          state.source = 'GitHub Actions 自动同步';
          localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), items: state.posts }));
          restoreFromUrl();
          return;
        }
      }
      const response = await fetch(`${apiBase}/issues?state=open&per_page=100&sort=created&direction=desc`, { headers: { Accept: 'application/vnd.github.full+json' } });
      if (!response.ok) throw new Error(`GitHub API ${response.status}`);
      const issues = (await response.json()).filter((issue) => !issue.pull_request && issue.labels?.length).map(normalizeIssue);
      if (issues.length) {
        state.posts = sortedPosts(issues);
        state.source = 'GitHub Issues 实时数据';
        localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), items: state.posts }));
      } else {
        state.posts = sortedPosts(fallbackPosts);
        state.source = '内置文章 · 等待第一个 GitHub Issue';
      }
    } catch (error) {
      if (!state.posts.length) {
        state.posts = sortedPosts(fallbackPosts);
        state.source = '内置文章 · GitHub API 暂不可用';
      }
      console.warn('Lightwind OS blog source:', error);
    }
    restoreFromUrl();
  }

  document.querySelector('#osSearchToggle').addEventListener('click', () => {
    searchTools.hidden = !searchTools.hidden;
    if (!searchTools.hidden) searchInput.focus();
  });
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    state.query = searchInput.value.trim();
    state.page = 1;
    renderList();
    updateUrl({ q: state.query, blogPage: null });
  });
  searchInput.addEventListener('input', () => {
    state.query = searchInput.value.trim();
    state.page = 1;
    renderList();
  });
  document.querySelector('#osSearchClear').addEventListener('click', () => {
    searchInput.value = '';
    state.query = '';
    state.page = 1;
    renderList();
    updateUrl({ q: null, blogPage: null });
  });
  filter.addEventListener('click', (event) => {
    const button = event.target.closest('[data-tag]');
    if (!button) return;
    state.tag = button.dataset.tag;
    state.page = 1;
    renderList();
    updateUrl({ tag: state.tag, blogPage: null });
  });
  postList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-post-id]');
    if (button) openPost(button.dataset.postId);
  });
  pagination.addEventListener('click', (event) => {
    const button = event.target.closest('[data-blog-page]');
    if (!button || button.disabled) return;
    state.page = Number(button.dataset.blogPage);
    renderList();
    pageElement.scrollTo({ top: 0, behavior: 'smooth' });
    updateUrl({ blogPage: state.page });
  });
  document.querySelector('#osPostBack').addEventListener('click', () => closePost());
  document.querySelector('#osPostNeighbors').addEventListener('click', (event) => {
    const button = event.target.closest('[data-post-id]');
    if (button) openPost(button.dataset.postId);
  });
  document.querySelector('#osCopyLink').addEventListener('click', (event) => copyText(window.location.href, event.currentTarget));
  document.querySelector('#osLoadComments').addEventListener('click', loadComments);
  document.querySelector('#osPostBody').addEventListener('click', (event) => {
    const button = event.target.closest('.os-code > button');
    if (button) copyText(button.parentElement.querySelector('code').textContent, button);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.target.matches('input, textarea')) {
      if (document.body.dataset.page !== '2') return;
      event.preventDefault();
      searchTools.hidden = false;
      searchInput.focus();
    }
    if (event.key === 'Escape' && state.currentPost) closePost();
  });
  window.addEventListener('popstate', restoreFromUrl);

  const copyrightYear = document.querySelector('#copyrightYear');
  if (copyrightYear) copyrightYear.textContent = new Date().getFullYear();

  loadPosts();
}
