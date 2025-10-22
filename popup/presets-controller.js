import { storageLocal } from "../shared/storage.js";
import { DEFAULT_LOCAL_STATE, getPresetDefaults } from "../shared/defaults.js";

const TOOL_DATASET_TO_KEY = {
  "code-execution-toggle": "codeExecution",
  "search-toggle": "search",
  "url-context-toggle": "urlContext",
};

const deepEqual = (a, b) => {
  if (a === b) return true;
  if (
    typeof a !== "object" ||
    a === null ||
    typeof b !== "object" ||
    b === null
  )
    return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => deepEqual(a[key], b[key]));
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const updateSliderTrack = (slider) => {
  const progress =
    ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
  slider.style.setProperty("--slider-progress", `${progress}%`);
};

export class PresetsController {
  constructor(rootDocument = document) {
    this.document = rootDocument;
    this.elements = this.getElements();
    this.state = {
      defaults: null,
      toolStates: {
        codeExecution: false,
        search: true,
        urlContext: false,
      },
      currentSettings: null,
      deleteIndex: null,
      activePresetIndex: -1,
    };
  }

  getElements() {
    const byId = (id) => this.document.getElementById(id);

    return {
      temperatureSlider: byId("temperature-slider"),
      temperatureInput: byId("temperature-value-input"),
      topPSlider: byId("top-p-slider"),
      topPInput: byId("top-p-value-input"),
      systemInstructions: byId("system-instructions-textarea"),
      toolContainers: this.document.querySelectorAll(".tool"),
      savePresetBtn: byId("save-preset-btn"),
      addNewPresetBtn: byId("add-new-preset-btn"),
      presetsList: byId("presets-list-container"),
      presetsSection: this.document.querySelector(".presets-section"),
      noPresetsMsg: byId("no-presets-msg"),
      savePresetModal: byId("save-preset-modal"),
      savePresetModalSaveBtn: byId("save-preset-modal-save-btn"),
      savePresetModalCancelBtn: byId("save-preset-modal-cancel-btn"),
      presetNameModalInput: byId("preset-name-modal-input"),
      deleteConfirmModal: byId("delete-confirm-modal"),
      deleteConfirmBtn: byId("delete-confirm-modal-confirm-btn"),
      deleteCancelBtn: byId("delete-confirm-modal-cancel-btn"),
    };
  }

  async init() {
    this.state.defaults = await getPresetDefaults();
    this.state.toolStates = { ...this.state.defaults.tools };
    this.bindEvents();
    await this.hydrateInitialState();
    await this.renderPresets();
    this.updateButtonState();
  }

  bindEvents() {
    const {
      temperatureSlider,
      topPSlider,
      temperatureInput,
      topPInput,
      systemInstructions,
      toolContainers,
      savePresetBtn,
      addNewPresetBtn,
      savePresetModal,
      savePresetModalSaveBtn,
      savePresetModalCancelBtn,
      presetNameModalInput,
      deleteConfirmModal,
      deleteConfirmBtn,
      deleteCancelBtn,
      presetsList,
    } = this.elements;

    temperatureSlider?.addEventListener("input", () => {
      this.syncSliderToInput(temperatureSlider, temperatureInput);
      this.updateButtonState();
    });

    topPSlider?.addEventListener("input", () => {
      this.syncSliderToInput(topPSlider, topPInput);
      this.updateButtonState();
    });

    temperatureInput?.addEventListener("change", () => {
      this.syncInputToSlider(temperatureInput, temperatureSlider);
      this.updateButtonState();
    });

    topPInput?.addEventListener("change", () => {
      this.syncInputToSlider(topPInput, topPSlider);
      this.updateButtonState();
    });

    systemInstructions?.addEventListener("input", () =>
      this.updateButtonState(),
    );

    toolContainers.forEach((container) => {
      container.addEventListener("click", (event) => {
        event.preventDefault();
        const key = TOOL_DATASET_TO_KEY[container.dataset.tool];
        if (!key) return;
        this.toggleTool(key);
      });
    });

    savePresetBtn?.addEventListener("click", () => this.handleSavePreset());
    addNewPresetBtn?.addEventListener("click", () => this.openSaveModal());

    savePresetModal?.addEventListener("click", (event) => {
      if (event.target === savePresetModal) {
        this.closeSaveModal();
      }
    });

    savePresetModalSaveBtn?.addEventListener("click", () =>
      this.persistNewPreset(),
    );
    savePresetModalCancelBtn?.addEventListener("click", () =>
      this.closeSaveModal(),
    );

    presetNameModalInput?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.persistNewPreset();
      } else if (event.key === "Escape") {
        this.closeSaveModal();
      }
    });

    deleteConfirmModal?.addEventListener("click", (event) => {
      if (event.target === deleteConfirmModal) {
        this.closeDeleteModal();
      }
    });

    deleteConfirmBtn?.addEventListener("click", () => this.confirmDelete());
    deleteCancelBtn?.addEventListener("click", () => this.closeDeleteModal());

    presetsList?.addEventListener("click", (event) =>
      this.handleListClick(event),
    );
    presetsList?.addEventListener("dblclick", (event) =>
      this.handleListDoubleClick(event),
    );
  }

  async hydrateInitialState() {
    const { presets, activePresetIndex } =
      await storageLocal.get(DEFAULT_LOCAL_STATE);
    if (
      Array.isArray(presets) &&
      presets.length > 0 &&
      activePresetIndex >= 0 &&
      presets[activePresetIndex]
    ) {
      await this.applyPreset(presets[activePresetIndex]);
      this.state.currentSettings = this.extractSettings(
        presets[activePresetIndex],
      );
      this.state.activePresetIndex = activePresetIndex;
    } else {
      await this.resetToDefaults();
    }
  }

  extractSettings(preset) {
    return {
      temperature: preset.temperature ?? this.state.defaults.temperature,
      topP: preset.topP ?? this.state.defaults.topP,
      systemInstructions: preset.systemInstructions ?? "",
      tools: {
        codeExecution:
          preset.tools?.codeExecution ??
          this.state.defaults.tools.codeExecution,
        search: preset.tools?.search ?? this.state.defaults.tools.search,
        urlContext:
          preset.tools?.urlContext ?? this.state.defaults.tools.urlContext,
      },
    };
  }

  getCurrentSettings() {
    const { temperatureSlider, topPSlider, systemInstructions } = this.elements;

    const temperature = parseFloat(
      temperatureSlider?.value ?? this.state.defaults.temperature,
    );
    const topP = parseFloat(topPSlider?.value ?? this.state.defaults.topP);
    return {
      temperature,
      topP,
      systemInstructions: systemInstructions?.value ?? "",
      tools: { ...this.state.toolStates },
    };
  }

  async applyPreset(preset) {
    const {
      temperatureSlider,
      temperatureInput,
      topPSlider,
      topPInput,
      systemInstructions,
    } = this.elements;
    const settings = this.extractSettings(preset);

    if (temperatureSlider) {
      temperatureSlider.value = settings.temperature;
      updateSliderTrack(temperatureSlider);
    }
    if (temperatureInput) {
      temperatureInput.value = settings.temperature.toFixed(2);
    }
    if (topPSlider) {
      topPSlider.value = settings.topP;
      updateSliderTrack(topPSlider);
    }
    if (topPInput) {
      topPInput.value = settings.topP.toFixed(2);
    }
    if (systemInstructions) {
      systemInstructions.value = settings.systemInstructions;
    }

    this.state.toolStates = { ...settings.tools };
    this.updateToolVisuals();
    this.state.currentSettings = settings;
    this.updateButtonState();
  }

  async resetToDefaults() {
    await this.applyPreset(this.state.defaults);
    await storageLocal.set({ activePresetIndex: -1 });
    this.state.activePresetIndex = -1;
  }

  updateToolVisuals() {
    this.elements.toolContainers.forEach((container) => {
      const key = TOOL_DATASET_TO_KEY[container.dataset.tool];
      if (!key) return;
      container.classList.toggle("active", Boolean(this.state.toolStates[key]));
    });
  }

  toggleTool(key) {
    this.state.toolStates = {
      ...this.state.toolStates,
      [key]: !this.state.toolStates[key],
    };
    this.updateToolVisuals();
    this.updateButtonState();
  }

  syncSliderToInput(slider, input) {
    const value = parseFloat(slider.value);
    if (!Number.isFinite(value)) return;
    if (input) {
      input.value = value.toFixed(2);
    }
    updateSliderTrack(slider);
  }

  syncInputToSlider(input, slider) {
    const parsed = parseFloat(input.value);
    const value = Number.isFinite(parsed) ? parsed : parseFloat(slider.min);
    const clamped = clamp(
      value,
      parseFloat(slider.min),
      parseFloat(slider.max),
    );
    slider.value = clamped;
    input.value = clamped.toFixed(2);
    updateSliderTrack(slider);
  }

  updateButtonState() {
    const { savePresetBtn } = this.elements;
    if (!savePresetBtn) return;
    if (this.state.activePresetIndex === -1) {
      savePresetBtn.disabled = false;
      savePresetBtn.textContent = "Save as Preset";
      return;
    }
    const current = this.getCurrentSettings();
    savePresetBtn.disabled = deepEqual(current, this.state.currentSettings);
    savePresetBtn.textContent = "Save";
  }

  async handleSavePreset() {
    const { savePresetBtn } = this.elements;
    const { presets, activePresetIndex } =
      await storageLocal.get(DEFAULT_LOCAL_STATE);
    if (
      Array.isArray(presets) &&
      presets.length > 0 &&
      activePresetIndex >= 0
    ) {
      if (savePresetBtn?.disabled) return;
      const updatedSettings = this.getCurrentSettings();
      const updatedPresets = [...presets];
      const activePreset = {
        ...updatedPresets[activePresetIndex],
        ...updatedSettings,
      };
      updatedPresets[activePresetIndex] = activePreset;
      await storageLocal.set({ presets: updatedPresets });
      await this.applyPreset(activePreset);
      this.flashButton("Saved!");
      await this.renderPresets();
    } else {
      this.openSaveModal();
    }
  }

  flashButton(text) {
    const { savePresetBtn } = this.elements;
    if (!savePresetBtn) return;
    const original = savePresetBtn.textContent;
    savePresetBtn.textContent = text;
    setTimeout(() => {
      savePresetBtn.textContent = original;
    }, 1500);
  }

  openSaveModal() {
    const { savePresetModal, presetNameModalInput } = this.elements;
    if (!savePresetModal) return;
    presetNameModalInput.value = "";
    savePresetModal.style.display = "flex";
    presetNameModalInput.focus();
  }

  closeSaveModal() {
    const { savePresetModal } = this.elements;
    if (savePresetModal) {
      savePresetModal.style.display = "none";
    }
  }

  openDeleteModal(index) {
    const { deleteConfirmModal } = this.elements;
    if (!deleteConfirmModal) return;
    this.state.deleteIndex = index;
    deleteConfirmModal.style.display = "flex";
  }

  closeDeleteModal() {
    const { deleteConfirmModal } = this.elements;
    if (deleteConfirmModal) {
      deleteConfirmModal.style.display = "none";
    }
    this.state.deleteIndex = null;
  }

  async persistNewPreset() {
    const { presetNameModalInput } = this.elements;
    const name = presetNameModalInput.value.trim();
    if (!name) return;
    const { presets } = await storageLocal.get(DEFAULT_LOCAL_STATE);
    const updatedPresets = Array.isArray(presets) ? [...presets] : [];
    const newPreset = { name, ...this.getCurrentSettings() };
    updatedPresets.push(newPreset);
    const newIndex = updatedPresets.length - 1;
    await storageLocal.set({
      presets: updatedPresets,
      activePresetIndex: newIndex,
    });
    this.state.activePresetIndex = newIndex;
    await this.applyPreset(newPreset);
    await this.renderPresets();
    this.closeSaveModal();
  }

  async confirmDelete() {
    if (this.state.deleteIndex === null) return;
    const deleteIndex = this.state.deleteIndex;
    const { presets, activePresetIndex } =
      await storageLocal.get(DEFAULT_LOCAL_STATE);
    if (!Array.isArray(presets) || !presets[deleteIndex]) {
      this.closeDeleteModal();
      return;
    }
    const updatedPresets = presets.filter((_, index) => index !== deleteIndex);
    let newActiveIndex = activePresetIndex;
    if (activePresetIndex === deleteIndex) {
      newActiveIndex = -1;
    } else if (activePresetIndex > deleteIndex) {
      newActiveIndex = activePresetIndex - 1;
    }
    await storageLocal.set({
      presets: updatedPresets,
      activePresetIndex: newActiveIndex,
    });

    this.state.activePresetIndex = newActiveIndex;

    if (newActiveIndex === -1) {
      await this.resetToDefaults();
    } else if (updatedPresets[newActiveIndex]) {
      await this.applyPreset(updatedPresets[newActiveIndex]);
    }

    await this.renderPresets();
    this.closeDeleteModal();
  }

  async renderPresets() {
    const { presetsList, presetsSection, noPresetsMsg, addNewPresetBtn } =
      this.elements;
    if (!presetsList) return;
    const { presets = [], activePresetIndex } =
      await storageLocal.get(DEFAULT_LOCAL_STATE);

    const hasPresets = Array.isArray(presets) && presets.length > 0;

    if (presetsSection) {
      presetsSection.style.display = hasPresets ? "flex" : "none";
    }
    if (noPresetsMsg) {
      noPresetsMsg.style.display = hasPresets ? "none" : "block";
    }
    if (addNewPresetBtn) {
      addNewPresetBtn.style.display = hasPresets ? "block" : "none";
    }

    presetsList.replaceChildren();
    if (!hasPresets) {
      this.state.activePresetIndex = -1;
      this.updateButtonState();
      return;
    }

    presets.forEach((preset, index) => {
      if (!preset?.name) return;
      const li = this.document.createElement("li");
      li.className = `preset${index === activePresetIndex ? " selected" : ""}`;
      li.dataset.index = String(index);
      li.innerHTML = `
        <div class="preset__reorder">
          <button class="preset__reorder-button preset__reorder-button--up" title="Move up" ${index === 0 ? "disabled" : ""}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          </button>
          <button class="preset__reorder-button preset__reorder-button--down" title="Move down" ${index === presets.length - 1 ? "disabled" : ""}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>
        <span class="preset__name">${preset.name}</span>
        <div class="preset__actions">
          <button class="preset__action-button preset__action-button--delete" title="Delete preset">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      `;
      presetsList.appendChild(li);
    });

    this.state.activePresetIndex = activePresetIndex;
    this.updateButtonState();
  }

  async selectPreset(index) {
    const numericIndex = Number.parseInt(index, 10);
    const { presets } = await storageLocal.get(DEFAULT_LOCAL_STATE);
    if (!Array.isArray(presets) || !presets[numericIndex]) return;
    await storageLocal.set({ activePresetIndex: numericIndex });
    this.state.activePresetIndex = numericIndex;
    await this.applyPreset(presets[numericIndex]);
    await this.renderPresets();
  }

  async movePreset(index, direction) {
    const offset = direction === "up" ? -1 : 1;
    const fromIndex = Number.parseInt(index, 10);
    const toIndex = fromIndex + offset;
    const { presets, activePresetIndex } =
      await storageLocal.get(DEFAULT_LOCAL_STATE);
    if (!Array.isArray(presets)) return;
    if (toIndex < 0 || toIndex >= presets.length) return;
    const updatedPresets = [...presets];
    const [moved] = updatedPresets.splice(fromIndex, 1);
    updatedPresets.splice(toIndex, 0, moved);

    let newActiveIndex = activePresetIndex;
    if (activePresetIndex === fromIndex) {
      newActiveIndex = toIndex;
    } else if (activePresetIndex === toIndex) {
      newActiveIndex = fromIndex;
    }

    await storageLocal.set({
      presets: updatedPresets,
      activePresetIndex: newActiveIndex,
    });

    this.state.activePresetIndex = newActiveIndex;
    await this.renderPresets();
  }

  handleListClick(event) {
    const li = event.target.closest(".preset");
    if (!li) return;
    const index = li.dataset.index;
    if (event.target.closest(".preset__action-button--delete")) {
      this.openDeleteModal(Number.parseInt(index, 10));
      return;
    }
    if (event.target.closest(".preset__reorder-button--up")) {
      this.movePreset(index, "up");
      return;
    }
    if (event.target.closest(".preset__reorder-button--down")) {
      this.movePreset(index, "down");
      return;
    }
    this.selectPreset(index);
  }

  handleListDoubleClick(event) {
    const nameSpan = event.target.closest(".preset__name");
    if (!nameSpan) return;
    const li = event.target.closest(".preset");
    if (!li) return;
    const index = Number.parseInt(li.dataset.index, 10);
    this.editPresetName(nameSpan, index);
  }

  async editPresetName(span, index) {
    const input = this.document.createElement("input");
    input.type = "text";
    input.value = span.textContent;
    input.className = "preset__name-input";
    span.replaceWith(input);
    input.focus();
    input.select();

    const revert = () => {
      input.replaceWith(span);
    };

    input.addEventListener(
      "blur",
      async () => {
        await this.persistPresetName(input.value.trim(), index);
      },
      { once: true },
    );

    input.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        await this.persistPresetName(input.value.trim(), index);
      } else if (event.key === "Escape") {
        event.preventDefault();
        revert();
      }
    });
  }

  async persistPresetName(name, index) {
    if (!name) {
      await this.renderPresets();
      return;
    }
    const { presets } = await storageLocal.get(DEFAULT_LOCAL_STATE);
    if (!Array.isArray(presets) || !presets[index]) {
      await this.renderPresets();
      return;
    }
    const updatedPresets = [...presets];
    updatedPresets[index] = { ...updatedPresets[index], name };
    await storageLocal.set({ presets: updatedPresets });
    await this.renderPresets();
  }
}
