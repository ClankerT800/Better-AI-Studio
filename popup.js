(() => {
  const elements = {
    ts: document.getElementById('temperature-slider'),
    ti: document.getElementById('temperature-value-input'),
    tps: document.getElementById('top-p-slider'),
    pi: document.getElementById('top-p-value-input'),
    tc: document.querySelectorAll('.tool'),
    si: document.getElementById('system-instructions-textarea'),
    pl: document.getElementById('presets-list-container'),
    sb: document.getElementById('save-preset-btn'),
    ab: document.getElementById('add-new-preset-btn'),
    md: document.getElementById('save-preset-modal'),
    ms: document.getElementById('save-preset-modal-save-btn'),
    mc: document.getElementById('save-preset-modal-cancel-btn'),
    mi: document.getElementById('preset-name-modal-input'),
    dm: document.getElementById('delete-confirm-modal'),
    dc: document.getElementById('delete-confirm-modal-confirm-btn'),
    dx: document.getElementById('delete-confirm-modal-cancel-btn'),
    nm: document.getElementById('no-presets-msg'),
    ps: document.querySelector('.presets-section'),
  };

  const state = new Proxy({
    currentSettings: null,
    deleteIndex: -1,
    processing: false,
    rafIds: new Set(),
    toolStates: {
      codeExecution: false,
      search: true,
      urlContext: false,
    },
  }, {
    set(target, prop, value) {
      target[prop] = value;
      if (prop === 'processing') updateButtonState();
      if (prop === 'toolStates') updateToolVisuals();
      return true;
    },
  });

  const raf = (fn) => {
    const id = requestAnimationFrame(() => {
      state.rafIds.delete(id);
      fn();
    });
    state.rafIds.add(id);
    return id;
  };

  const deepEqual = (a, b) => {
    if (a === b) return true;
    if (typeof a !== 'object' || !a || typeof b !== 'object' || !b) return false;
    const keysA = Object.keys(a), keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(k => keysB.includes(k) && deepEqual(a[k], b[k]));
  };

  const getSettings = () => ({
    temperature: parseFloat(elements.ts.value),
    topP: parseFloat(elements.tps.value),
    tools: {
      codeExecution: state.toolStates.codeExecution,
      search: state.toolStates.search,
      urlContext: state.toolStates.urlContext,
    },
    systemInstructions: elements.si.value,
  });

  const updateButtonState = () => {
    if (state.processing) return;
    chrome.storage.local.get('activePresetIndex', ({ activePresetIndex: index }) => {
      if (index === -1 || index === undefined) {
        elements.sb.disabled = false;
        return;
      }
      elements.sb.disabled = deepEqual(state.currentSettings, getSettings());
    });
  };

  const updateSliderTrack = (slider) => {
    const progress = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.setProperty('--slider-progress', `${progress}%`);
  };

  const syncSliderToInput = (slider, input) => {
    raf(() => {
      input.value = parseFloat(slider.value).toFixed(2);
    });
  };

  const syncInputToSlider = (input, slider) => {
    let value = parseFloat(input.value);
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    if (isNaN(value)) value = min;
    value = Math.max(min, Math.min(max, value));
    state.processing = true;
    raf(() => {
      slider.value = value;
      input.value = value.toFixed(2);
      updateSliderTrack(slider);
      state.processing = false;
      updateButtonState();
    });
  };

  const editPresetName = (span, index) => {
    const original = span.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = original;
    input.className = 'preset__name-input';
    span.replaceWith(input);
    input.focus();
    input.select();

    const save = () => {
      const newName = input.value.trim();
      if (newName && newName !== original) {
        chrome.storage.local.get('presets', ({ presets }) => {
          if (presets?.[index]) {
            presets[index].name = newName;
            chrome.storage.local.set({ presets }, renderPresets);
          }
        });
      } else {
        renderPresets();
      }
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
      else if (e.key === 'Escape') renderPresets();
    });
  };

  const movePreset = (fromIndex, direction) => {
    chrome.storage.local.get(['presets', 'activePresetIndex'], ({ presets = [], activePresetIndex: currentIndex }) => {
      if (!presets?.[fromIndex]) return;

      const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
      if (toIndex < 0 || toIndex >= presets.length) return;

      const fromElement = document.querySelector(`[data-index="${fromIndex}"]`);
      const toElement = document.querySelector(`[data-index="${toIndex}"]`);

      if (fromElement && toElement) {
        fromElement.style.transform = 'translateX(4px)';
        fromElement.style.transition = 'transform 0.2s ease';
        toElement.style.transform = 'translateX(-4px)';
        toElement.style.transition = 'transform 0.2s ease';

        setTimeout(() => {
          fromElement.style.transform = '';
          toElement.style.transform = '';
        }, 200);
      }

      [presets[fromIndex], presets[toIndex]] = [presets[toIndex], presets[fromIndex]];

      let newActiveIndex = currentIndex;
      if (currentIndex === fromIndex) {
        newActiveIndex = toIndex;
      } else if (currentIndex === toIndex) {
        newActiveIndex = fromIndex;
      }

      chrome.storage.local.set({ presets, activePresetIndex: newActiveIndex }, renderPresets);
    });
  };

  const selectPreset = (index) => {
    chrome.storage.local.get('presets', ({ presets }) => {
      if (!presets?.[index]) return;
      chrome.storage.local.set({ activePresetIndex: index }, () => {
        applyPreset(presets[index]);
        renderPresets();
      });
    });
  };

  const renderPresets = () => {
    chrome.storage.local.get(['presets', 'activePresetIndex'], ({ presets = [], activePresetIndex: index }) => {
      raf(() => {
        const exists = presets.length > 0;
        document.body.classList.toggle('no-presets', !exists);
        elements.ps.style.display = exists ? 'block' : 'none';
        elements.nm.style.display = exists ? 'none' : 'block';
        elements.ab.style.display = exists ? 'block' : 'none';

        if (exists) {
          elements.sb.textContent = 'Save';
          const fragment = document.createDocumentFragment();
          presets.forEach((preset, i) => {
            if (!preset?.name) return;
            const li = document.createElement('li');
            li.className = `preset ${i === index ? 'selected' : ''}`;
            li.dataset.index = i;
            const reorderButtons = presets.length > 1 ? `
              <div class="preset__reorder">
                <button class="preset__reorder-button preset__reorder-button--up" title="Move up" ${i === 0 ? 'disabled' : ''}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="18 15 12 9 6 15"></polyline>
                  </svg>
                </button>
                <button class="preset__reorder-button preset__reorder-button--down" title="Move down" ${i === presets.length - 1 ? 'disabled' : ''}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
              </div>
            ` : '';

            li.innerHTML = `${reorderButtons}<span class="preset__name">${preset.name}</span><div class="preset__actions"><button class="preset__action-button preset__action-button--delete" title="Delete"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button></div>`;
            fragment.appendChild(li);
          });
          elements.pl.innerHTML = '';
          elements.pl.appendChild(fragment);
        } else {
          elements.sb.textContent = 'Save as Preset';
          elements.pl.innerHTML = '';
        }
        updateButtonState();
      });
    });
  };

  const toolMap = {
    'code-execution-toggle': 'codeExecution',
    'search-toggle': 'search',
    'url-context-toggle': 'urlContext'
  };

  const updateToolVisuals = () => {
    raf(() => {
      elements.tc.forEach(c => {
        const stateKey = toolMap[c.dataset.tool];
        c.classList.toggle('active', state.toolStates[stateKey]);
      });
    });
  };

  const applyPreset = (preset) => {
    state.processing = true;
    raf(() => {
      elements.ts.value = preset.temperature;
      elements.tps.value = preset.topP;
      elements.ti.value = preset.temperature.toFixed(2);
      elements.pi.value = preset.topP.toFixed(2);
      updateSliderTrack(elements.ts);
      updateSliderTrack(elements.tps);
      state.toolStates = { ...preset.tools };
      elements.si.value = preset.systemInstructions || '';
      updateToolVisuals();
      state.processing = false;
    });
    const { name, ...settings } = preset;
    state.currentSettings = settings;
    updateButtonState();
  };

  const resetToDefaults = () => {
    const defaults = {
      temperature: 1.0,
      topP: 0.95,
      tools: { codeExecution: false, search: true, urlContext: false },
      systemInstructions: ''
    };
    applyPreset(defaults);
    state.currentSettings = defaults;
    state.toolStates = { ...defaults.tools };
    chrome.storage.local.set({ activePresetIndex: -1 }, renderPresets);
  };

  const closeModal = (modal) => () => modal.style.display = 'none';
  const closeSaveModal = closeModal(elements.md);
  const closeDeleteModal = closeModal(elements.dm);

  elements.ti.addEventListener('change', () => syncInputToSlider(elements.ti, elements.ts));
  elements.pi.addEventListener('change', () => syncInputToSlider(elements.pi, elements.tps));
  elements.ts.addEventListener('input', () => {
    syncSliderToInput(elements.ts, elements.ti);
    updateSliderTrack(elements.ts);
  });
  elements.tps.addEventListener('input', () => {
    syncSliderToInput(elements.tps, elements.pi);
    updateSliderTrack(elements.tps);
  });

  [elements.ts, elements.tps, elements.si, elements.ti, elements.pi].forEach(e => {
    const event = e.type === 'range' || e.type === 'textarea' ? 'input' : 'change';
    e.addEventListener(event, updateButtonState);
  });

  elements.tc.forEach(c => {
    c.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.target.tagName !== 'INPUT') {
        const stateKey = toolMap[c.dataset.tool];
        state.toolStates = { ...state.toolStates, [stateKey]: !state.toolStates[stateKey] };
        updateButtonState();
      }
    });
  });

  let clickTimeout = null;

  elements.pl.addEventListener('click', (e) => {
    const li = e.target.closest('.preset');
    if (!li || li.querySelector('.preset__name-input')) return;
    const index = parseInt(li.dataset.index, 10);
    if (isNaN(index)) return;

    if (e.target.closest('.preset__action-button--delete')) {
      e.stopPropagation();
      state.deleteIndex = index;
      elements.dm.style.display = 'flex';
    } else if (e.target.closest('.preset__reorder-button--up')) {
      e.preventDefault();
      e.stopPropagation();
      movePreset(index, 'up');
    } else if (e.target.closest('.preset__reorder-button--down')) {
      e.preventDefault();
      e.stopPropagation();
      movePreset(index, 'down');
    } else {
      if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
      }

      clickTimeout = setTimeout(() => {
        selectPreset(index);
        clickTimeout = null;
      }, 50);
    }
  });

  elements.pl.addEventListener('dblclick', (e) => {
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      clickTimeout = null;
    }

    const span = e.target.closest('.preset__name');
    const li = e.target.closest('.preset');
    if (span && li?.dataset.index) {
      editPresetName(span, parseInt(li.dataset.index, 10));
    }
  });

  elements.dc.addEventListener('click', () => {
    if (state.deleteIndex === -1) return;
    chrome.storage.local.get(['presets', 'activePresetIndex'], ({ presets, activePresetIndex: index }) => {
      presets.splice(state.deleteIndex, 1);
      const newIndex = index === state.deleteIndex ? -1 : (index > state.deleteIndex ? index - 1 : index);
      chrome.storage.local.set({ presets, activePresetIndex: newIndex }, () => {
        if (newIndex === -1) resetToDefaults();
        else selectPreset(newIndex);
        renderPresets();
        closeDeleteModal();
        state.deleteIndex = -1;
      });
    });
  });

  elements.mc.addEventListener('click', closeSaveModal);
  elements.md.addEventListener('click', (e) => e.target === elements.md && closeSaveModal());
  elements.dx.addEventListener('click', closeDeleteModal);
  elements.dm.addEventListener('click', (e) => e.target === elements.dm && closeDeleteModal());

  elements.ab.addEventListener('click', () => {
    elements.mi.value = '';
    elements.md.style.display = 'flex';
    elements.mi.focus();
  });

  elements.sb.addEventListener('click', () => {
    chrome.storage.local.get(['presets', 'activePresetIndex'], ({ presets = [], activePresetIndex: index }) => {
      if (presets.length > 0) {
        if (elements.sb.disabled) return;
        const settings = getSettings();
        presets[index] = { ...settings, name: presets[index].name };
        chrome.storage.local.set({ presets }, () => {
          state.currentSettings = settings;
          const originalText = elements.sb.textContent;
          elements.sb.textContent = 'Saved!';
          updateButtonState();
          setTimeout(() => { elements.sb.textContent = originalText; }, 1500);
        });
      } else {
        elements.mi.value = '';
        elements.md.style.display = 'flex';
        elements.mi.focus();
      }
    });
  });

  const saveNewPreset = () => {
    const name = elements.mi.value.trim();
    if (!name) return;
    const preset = { name, ...getSettings() };
    chrome.storage.local.get('presets', ({ presets = [] }) => {
      presets.push(preset);
      chrome.storage.local.set({ presets, activePresetIndex: presets.length - 1 }, () => {
        applyPreset(preset);
        renderPresets();
        closeSaveModal();
      });
    });
  };

  elements.ms.addEventListener('click', saveNewPreset);
  elements.mi.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveNewPreset();
    } else if (e.key === 'Escape') {
      closeSaveModal();
    }
  });

  chrome.storage.local.get(['presets', 'activePresetIndex'], ({ presets = [], activePresetIndex: index }) => {
    raf(() => {
      if (presets.length > 0 && index >= 0 && index < presets.length) {
        applyPreset(presets[index]);
      } else {
        resetToDefaults();
      }
      renderPresets();
    });
  });

  window.addEventListener('beforeunload', () => {
    state.rafIds.forEach(cancelAnimationFrame);
    state.rafIds.clear();
  }, { once: true, passive: true });
})();