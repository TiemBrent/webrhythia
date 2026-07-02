import { DIFFICULTIES, DIFFICULTY_COLORS } from "./constants.js";
import { formatTime } from "./utils.js";
import { MODS } from "./mods.js";

export class SongSelectScreen {
  constructor({ onPlay }) {
    this.onPlay = onPlay;
    this.maps = [];
    this.selected = null;
    this.speed = 1;
    this.mods = { NoFail: false, Ghost: false };

    this.listEl = document.getElementById("song-list");
    this.detailEl = document.getElementById("song-detail");
    this.searchEl = document.getElementById("song-search");
    this.searchEl.addEventListener("input", () => this.render());
  }

  setMaps(maps) {
    this.maps = maps;
    if (!this.selected && maps.length) this.select(maps[0]);
    this.render();
  }

  addMap(map) {
    this.maps = [map, ...this.maps];
    this.select(map);
    this.render();
  }

  select(map) {
    this.selected = map;
    this.render();
  }

  render() {
    const query = this.searchEl.value.trim().toLowerCase();
    const filtered = this.maps.filter(
      (m) => !query || m.prettyTitle.toLowerCase().includes(query) || m.prettyMappers.toLowerCase().includes(query)
    );

    this.listEl.innerHTML = "";
    for (const map of filtered) {
      const card = document.createElement("div");
      card.className = "song-card" + (this.selected === map ? " selected" : "");
      card.innerHTML = `
        <div class="song-card-diff" style="background:${DIFFICULTY_COLORS[map.difficulty] || "#666"}"></div>
        <div class="song-card-info">
          <div class="song-card-title">${escapeHtml(map.prettyTitle)}</div>
          <div class="song-card-sub">${escapeHtml(map.prettyMappers)} &middot; ${DIFFICULTIES[map.difficulty] || "N/A"}</div>
        </div>
        <div class="song-card-notes">${map.notes.length} notes</div>
      `;
      card.addEventListener("click", () => this.select(map));
      this.listEl.appendChild(card);
    }

    this.renderDetail();
  }

  renderDetail() {
    const map = this.selected;
    if (!map) {
      this.detailEl.innerHTML = `<div class="song-detail-empty">Select a map to see details</div>`;
      return;
    }

    this.detailEl.innerHTML = `
      <div>
        <h3>${escapeHtml(map.title)}</h3>
        <div class="sub">${escapeHtml(map.prettyMappers)}</div>
      </div>
      <div class="song-detail-row"><span>Difficulty</span><span>${DIFFICULTIES[map.difficulty] || "N/A"}</span></div>
      <div class="song-detail-row"><span>Notes</span><span>${map.notes.length}</span></div>
      <div class="song-detail-row"><span>Length</span><span>${formatTime(map.length / 1000)}</span></div>

      <div>
        <div class="sub" style="margin-bottom:8px;">Speed &middot; <span id="speed-value">${this.speed.toFixed(2)}x</span></div>
        <div class="speed-control">
          <input type="range" id="speed-range" min="0.5" max="2" step="0.05" value="${this.speed}" />
        </div>
      </div>

      <div>
        <div class="sub" style="margin-bottom:8px;">Mods</div>
        <div class="song-detail-mods" id="mod-chips">
          ${Object.entries(MODS)
            .map(
              ([key, mod]) =>
                `<div class="chip${this.mods[key] ? " active" : ""}" data-mod="${key}" title="${escapeHtml(mod.description)}">${mod.name}</div>`
            )
            .join("")}
        </div>
      </div>

      <button class="btn btn-primary btn-large" id="play-btn" style="margin-top:auto;">Play</button>
    `;

    this.detailEl.querySelector("#speed-range").addEventListener("input", (e) => {
      this.speed = parseFloat(e.target.value);
      this.detailEl.querySelector("#speed-value").textContent = `${this.speed.toFixed(2)}x`;
    });

    this.detailEl.querySelectorAll("[data-mod]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const key = chip.dataset.mod;
        this.mods[key] = !this.mods[key];
        chip.classList.toggle("active", this.mods[key]);
      });
    });

    this.detailEl.querySelector("#play-btn").addEventListener("click", () => {
      this.onPlay(map, { speed: this.speed, mods: { ...this.mods } });
    });
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
