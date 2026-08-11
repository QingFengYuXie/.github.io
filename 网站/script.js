const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('.site-nav');
const themeToggle = document.querySelector('.theme-toggle');

menuToggle?.addEventListener('click', () => {
  const isOpen = siteNav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

document.querySelectorAll('.site-nav a').forEach((link) => {
  link.addEventListener('click', () => {
    siteNav.classList.remove('open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  });
});

themeToggle?.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  themeToggle.textContent = isDark ? '☾' : '☼';
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
});

if (localStorage.getItem('theme') === 'dark') {
  document.body.classList.add('dark');
  themeToggle.textContent = '☾';
}

document.querySelector('#year').textContent = new Date().getFullYear();
