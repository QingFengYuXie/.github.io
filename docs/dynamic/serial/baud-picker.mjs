/** Editable baud-rate combobox. Keeps presets in the document's light theme. */
export function createBaudPicker({ input, toggle, listbox, container = input.closest('.baud-picker') }) {
  const options = [...listbox.querySelectorAll('[role="option"][data-value]')];
  let expanded = false;
  let activeIndex = -1;
  let committedValue = input.value;

  const disabled = () => input.matches(':disabled');
  const selectedIndex = () => options.findIndex((option) => option.dataset.value === input.value);

  function highlight(index) {
    activeIndex = index;
    options.forEach((option, optionIndex) => {
      option.setAttribute('aria-selected', String(optionIndex === activeIndex));
    });
    if (expanded && activeIndex >= 0) {
      const active = options[activeIndex];
      input.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  function close() {
    expanded = false;
    listbox.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-expanded', 'false');
    highlight(selectedIndex());
  }

  function open(direction = 0) {
    if (disabled()) return;
    expanded = true;
    listbox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-expanded', 'true');
    // Reopening always exposes all presets, including when a custom value is typed.
    options.forEach((option) => { option.hidden = false; });
    const selected = selectedIndex();
    highlight(selected >= 0 ? selected : direction > 0 ? 0 : direction < 0 ? options.length - 1 : -1);
  }

  function commit(index) {
    if (disabled() || index < 0 || index >= options.length) return;
    input.value = options[index].dataset.value;
    close();
    input.focus();
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function syncDisabled() {
    const isDisabled = disabled();
    toggle.disabled = isDisabled;
    input.setAttribute('aria-disabled', String(isDisabled));
    if (isDisabled) close();
  }

  toggle.addEventListener('pointerdown', (event) => event.preventDefault());
  toggle.addEventListener('click', () => {
    if (disabled()) return;
    input.focus();
    if (expanded) close();
    else open();
  });
  listbox.addEventListener('pointerdown', (event) => event.preventDefault());
  listbox.addEventListener('click', (event) => {
    const option = event.target.closest('[role="option"][data-value]');
    if (option && listbox.contains(option)) commit(options.indexOf(option));
  });
  input.addEventListener('input', () => highlight(selectedIndex()));
  input.addEventListener('change', () => {
    committedValue = input.value;
    highlight(selectedIndex());
  });
  input.addEventListener('keydown', (event) => {
    if (disabled() || event.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      if (!expanded) open(direction);
      else highlight(activeIndex < 0 ? direction > 0 ? 0 : options.length - 1 : (activeIndex + direction + options.length) % options.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (expanded && activeIndex >= 0) commit(activeIndex);
      else {
        close();
        if (input.value !== committedValue) input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') close();
  });
  container.addEventListener('focusout', () => {
    queueMicrotask(() => { if (!container.contains(document.activeElement)) close(); });
  });
  document.addEventListener('pointerdown', (event) => {
    if (!container.contains(event.target)) close();
  });
  // Also cover disabling the fieldset while a user has the popup open.
  const disabledObserver = new MutationObserver(syncDisabled);
  disabledObserver.observe(input, { attributes: true, attributeFilter: ['disabled'] });
  const fieldset = input.closest('fieldset');
  if (fieldset) disabledObserver.observe(fieldset, { attributes: true, attributeFilter: ['disabled'] });
  close();
  syncDisabled();
  return { close, syncDisabled };
}
