// js/parental.js - Parental Control System
const Parental = {
  PIN_KEY: 'canalplus_parental_pin',
  DEFAULT_PIN: '0000',

  ADULT_KEYWORDS: [
    'adult', 'xxx', 'porn', '+18', '18+', 'erotico', 'erótico',
    'playboy', 'venus', 'sexy', 'privé', 'prive', 'hustler',
    'redlight', 'brazzers', 'penthouse', 'sex drive', 'onlyfans', 'only fans'
  ],

  getPin() {
    return localStorage.getItem(this.PIN_KEY) || this.DEFAULT_PIN;
  },

  setPin(newPin) {
    if (newPin && newPin.length === 4) {
      localStorage.setItem(this.PIN_KEY, newPin);
      return true;
    }
    return false;
  },

  isAdultName(name) {
    if (!name) return false;
    const lower = name.toLowerCase();
    return this.ADULT_KEYWORDS.some(kw => lower.includes(kw));
  },

  verifyPin(inputPin) {
    return String(inputPin).trim() === this.getPin();
  },

  // Modal prompt promise.
  // Resolves true when the correct PIN is typed, false when the user cancels.
  // Wrong PINs keep the modal open with an error. Also lets the user change the PIN.
  promptPin() {
    return new Promise((resolve) => {
      const modal = document.getElementById('pin-modal');
      const dots = modal.querySelectorAll('.pin-dot');
      const display = modal.querySelector('.pin-display');
      const titleEl = document.getElementById('pin-title');
      const subEl = document.getElementById('pin-subtitle');
      const errEl = document.getElementById('pin-error');
      const changeBtn = document.getElementById('pin-change-btn');

      // mode: 'unlock' | 'change-old' | 'change-new' | 'change-confirm'
      let mode = 'unlock';
      let currentInput = '';
      let newPin = '';
      let busy = false;

      const TEXTS = {
        'unlock':         ['Conteúdo protegido', 'Digite a senha de 4 dígitos'],
        'change-old':     ['Alterar senha', 'Digite a senha atual'],
        'change-new':     ['Alterar senha', 'Digite a nova senha'],
        'change-confirm': ['Alterar senha', 'Confirme a nova senha']
      };

      const updateDots = () => {
        dots.forEach((dot, idx) => dot.classList.toggle('filled', idx < currentInput.length));
      };

      const setMode = (m, error = '') => {
        mode = m;
        currentInput = '';
        titleEl.textContent = TEXTS[m][0];
        subEl.textContent = TEXTS[m][1];
        errEl.textContent = error;
        changeBtn.textContent = m === 'unlock' ? 'Alterar senha' : 'Cancelar alteração';
        updateDots();
      };

      const fail = (msg) => {
        errEl.textContent = msg;
        display.classList.remove('shake');
        void display.offsetWidth; // restart animation
        display.classList.add('shake');
        setTimeout(() => {
          display.classList.remove('shake');
          currentInput = '';
          updateDots();
          busy = false;
        }, 400);
      };

      const cleanup = () => {
        modal.style.display = 'none';
        modal.classList.remove('pin-ok');
        window.removeEventListener('keydown', handleKey, true);
        currentInput = '';
        updateDots();
      };

      const finish = (result) => {
        cleanup();
        resolve(result);
      };

      const submit = () => {
        busy = true;
        const pin = currentInput;
        setTimeout(() => {
          if (mode === 'unlock') {
            if (Parental.verifyPin(pin)) {
              modal.classList.add('pin-ok');
              setTimeout(() => finish(true), 180);
            } else {
              fail('Senha incorreta');
            }
          } else if (mode === 'change-old') {
            if (Parental.verifyPin(pin)) { busy = false; setMode('change-new'); }
            else fail('Senha atual incorreta');
          } else if (mode === 'change-new') {
            newPin = pin; busy = false; setMode('change-confirm');
          } else if (mode === 'change-confirm') {
            if (pin === newPin) {
              Parental.setPin(newPin);
              busy = false;
              setMode('unlock');
              subEl.textContent = '✔ Senha alterada! Digite a nova senha';
            } else {
              busy = false;
              setMode('change-new', 'As senhas não conferem');
            }
          }
        }, 150);
      };

      const press = (val) => {
        if (busy) return;
        if (val === 'close') return finish(false);
        if (val === 'back') {
          currentInput = currentInput.slice(0, -1);
          updateDots();
          return;
        }
        if (currentInput.length >= 4) return;
        errEl.textContent = '';
        currentInput += val;
        updateDots();
        if (currentInput.length === 4) submit();
      };

      const handleKey = (e) => {
        const code = e.keyCode || e.which;
        let handled = true;
        if (e.key >= '0' && e.key <= '9') press(e.key);
        else if (code >= 96 && code <= 105) press(String(code - 96)); // numpad
        else if (e.key === 'Backspace' || code === 8) press('back');
        else if (e.key === 'Escape' || code === 27 || code === 10009 || code === 461) press('close');
        else handled = false; // let arrows/Enter reach the TV focus navigation
        if (handled) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      };

      modal.querySelectorAll('.pin-key').forEach(k => {
        k.onclick = () => press(k.getAttribute('data-val'));
      });
      changeBtn.onclick = () => {
        if (busy) return;
        setMode(mode === 'unlock' ? 'change-old' : 'unlock');
      };

      setMode('unlock');
      modal.style.display = 'flex';
      window.addEventListener('keydown', handleKey, true);
      const first = modal.querySelector('.pin-key[data-val="5"]');
      if (first) first.focus();
    });
  }
};
