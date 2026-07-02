import { settings, sectionsOf } from "./settingsStore.js";

export class SettingsScreen {
  constructor() {
    this.bodyEl = document.getElementById("settings-body");
    this.section = "Gameplay";
    document.querySelectorAll("#settings-tabs .tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll("#settings-tabs .tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        this.section = tab.dataset.section;
        this.render();
      });
    });
  }

  render() {
    const items = sectionsOf(this.section);
    this.bodyEl.innerHTML = "";
    for (const item of items) {
      const row = document.createElement("div");
      row.className = "setting-row";

      const value = settings.get(item.id);
      let controlHtml = "";
      if (item.type === "bool") {
        controlHtml = `
          <label class="switch">
            <input type="checkbox" data-id="${item.id}" ${value ? "checked" : ""} />
            <span class="track"></span>
          </label>`;
      } else if (item.type === "number") {
        controlHtml = `
          <input type="range" data-id="${item.id}" min="${item.slider.min}" max="${item.slider.max}" step="${item.slider.step}" value="${value}" />
          <span class="setting-value" data-value-for="${item.id}">${formatValue(value, item)}</span>`;
      } else if (item.type === "choice") {
        controlHtml = `<div class="choice-control">${item.choices
          .map((c) => `<div class="chip${c === value ? " active" : ""}" data-choice-id="${item.id}" data-choice-value="${c}">${c}</div>`)
          .join("")}</div>`;
      }

      row.innerHTML = `
        <div class="setting-info">
          <div class="title">${item.title}</div>
          <div class="desc">${item.description}</div>
        </div>
        <div class="setting-control">${controlHtml}</div>
      `;
      this.bodyEl.appendChild(row);
    }

    this.bodyEl.querySelectorAll('input[type="range"]').forEach((input) => {
      input.addEventListener("input", () => {
        const id = input.dataset.id;
        const item = items.find((i) => i.id === id);
        const value = parseFloat(input.value);
        settings.set(id, value);
        const label = this.bodyEl.querySelector(`[data-value-for="${id}"]`);
        if (label) label.textContent = formatValue(value, item);
      });
    });

    this.bodyEl.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.addEventListener("change", () => settings.set(input.dataset.id, input.checked));
    });

    this.bodyEl.querySelectorAll("[data-choice-id]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const id = chip.dataset.choiceId;
        const value = chip.dataset.choiceValue;
        settings.set(id, value);
        this.bodyEl.querySelectorAll(`[data-choice-id="${id}"]`).forEach((c) => c.classList.toggle("active", c === chip));
      });
    });
  }
}

function formatValue(value, item) {
  if (item.slider && item.slider.step >= 1) return String(Math.round(value));
  return value.toFixed(2);
}
