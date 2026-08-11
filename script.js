const bootScreen = document.querySelector('.boot-screen');
const launchButton = document.querySelector('.launch-button');
const soundToggle = document.querySelector('.sound-toggle');

function launch() {
  bootScreen?.classList.add('is-hidden');
  sessionStorage.setItem('qfyx-booted', '1');
}

if (sessionStorage.getItem('qfyx-booted') === '1') {
  bootScreen?.classList.add('is-hidden');
}

launchButton?.addEventListener('click', launch);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !bootScreen.classList.contains('is-hidden')) launch();
});

soundToggle?.addEventListener('click', () => {
  document.body.classList.toggle('quiet');
  soundToggle.innerHTML = document.body.classList.contains('quiet') ? '◑ <span>focus mode</span>' : '◐ <span>quiet mode</span>';
});

const sections = [...document.querySelectorAll('main section[id]')];
const navLinks = [...document.querySelectorAll('.nav-link')];
const observer = new IntersectionObserver((entries) => {
  const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  navLinks.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${visible.target.id}`));
}, { rootMargin: '-25% 0px -60% 0px', threshold: [0, .25, .6] });
sections.forEach((section) => observer.observe(section));

document.querySelector('#year').textContent = new Date().getFullYear();
