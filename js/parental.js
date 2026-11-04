// js/parental.js - Parental Control System
const Parental = {
  PIN_KEY: 'canalplus_parental_pin',
  DEFAULT_PIN: '0000',

  ADULT_KEYWORDS: [
    'adult', 'xxx', 'porn', '+18', '18+', 'erotico', 'erótico',
    'playboy', 'venus', 'sexy', 'privé', 'prive', 'hustler',
    'redlight', 'brazzers', 'penthouse', 'sex drive'
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

  // Modal prompt promise
  promptPin() {
    return new Promise((resolve) => {
      const modal = document.getElementById('pin-modal');
      const dots = document.querySelectorAll('.pin-dot');
      let currentInput = '';

      const updateDots = () => {
        dots.forEach((dot, idx) => {
          if (idx < currentInput.length) {
            dot.classList.add('filled');
          } else {
            dot.classList.remove('filled');
          }
        });
      };

      const cleanup = () => {
        modal.style.display = 'none';
        window.removeEventListener('keydown', handleKey);
        currentInput = '';
        updateDots();
      };

      const handleKey = (e) => {
        if (e.key >= '0' && e.key <= '9') {
          if (currentInput.length < 4) {
            currentInput += e.key;
            updateDots();
            if (currentInput.length === 4) {
              setTimeout(() => {
                const ok = Parental.verifyPin(currentInput);
                cleanup();
                resolve(ok);
              }, 200);
            }
          }
        } else if (e.key === 'Backspace') {
          currentInput = currentInput.slice(0, -1);
          updateDots();
        } else if (e.key === 'Escape') {
          cleanup();
          resolve(false);
        }
      };

      modal.style.display = 'flex';
      window.addEventListener('keydown', handleKey);

      // Setup on-screen keypad clicks
      const keys = modal.querySelectorAll('.pin-key');
      keys.forEach(k => {
        k.onclick = () => {
          const val = k.getAttribute('data-val');
          if (val === 'back') {
            currentInput = currentInput.slice(0, -1);
            updateDots();
          } else if (val === 'close') {
            cleanup();
            resolve(false);
          } else if (currentInput.length < 4) {
            currentInput += val;
            updateDots();
            if (currentInput.length === 4) {
              setTimeout(() => {
                const ok = Parental.verifyPin(currentInput);
                cleanup();
                resolve(ok);
              }, 200);
            }
          }
        };
      });
    });
  }
};
