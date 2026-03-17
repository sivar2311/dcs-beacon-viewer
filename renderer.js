window.addEventListener("DOMContentLoaded", () => {
  const tbody = document.querySelector("#beaconsTable tbody");
  const summary = document.querySelector("#summary");
  const currentFile = document.querySelector("#currentFile");
  const searchInput = document.querySelector("#search");
  const openFileBtn = document.querySelector("#openFileBtn");
  const headers = document.querySelectorAll("#beaconsTable thead th[data-key]");

  let allBeacons = [];
  let currentGlobalFilter = "";
  let currentSort = { key: null, direction: 1 };
  let openFilterMenu = null;

  let currentColumnFilters = {
    display_name: null,
    type: null,
    frequency_display: null,
    channel: null,
    latitude: null,
    longitude: null,
    direction: null
  };

  const headerKeyToFilterKey = {
    display_name: "display_name",
    type: "type",
    frequency: "frequency_display",
    channel: "channel",
    latitude: "latitude",
    longitude: "longitude",
    direction: "direction"
  };

  function formatType(type) {
    if (!type) return "";
    return type.replace(/^BEACON_TYPE_/, "").replace(/_/g, " ");
  }

  function formatFrequency(frequency) {
    if (frequency === null || frequency === undefined || Number.isNaN(frequency)) {
      return "";
    }

    const hz = Number(frequency);

    if (hz < 1_000_000) {
      const khz = hz / 1_000;
      return `${khz.toFixed(1)} kHz`;
    }

    const mhz = hz / 1_000_000;
    return `${mhz.toFixed(3)} MHz`;
  }

  function toDDM(value, isLat) {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return "";
    }

    const abs = Math.abs(value);
    const degrees = Math.floor(abs);
    const minutes = (abs - degrees) * 60;

    const direction = isLat
      ? value >= 0 ? "N" : "S"
      : value >= 0 ? "E" : "W";

    const degWidth = isLat ? 2 : 3;

    return `${direction} ${String(degrees).padStart(degWidth, "0")}°${minutes.toFixed(3)}'`;
  }

  function mapBeaconForView(row) {
    return {
      display_name: row.display_name ?? "",
      type: formatType(row.type),
      frequency: row.frequency ?? null,
      frequency_display: formatFrequency(row.frequency),
      channel: row.channel ?? "",
      latitude: toDDM(row.latitude, true),
      longitude: toDDM(row.longitude, false),
      direction:
        row.direction !== null && row.direction !== undefined
          ? `${((row.direction % 360 + 360) % 360).toFixed(1)}°`
          : ""
    };
  }

  function renderRows(rows) {
    tbody.innerHTML = "";

    for (const originalRow of rows) {
      const row = mapBeaconForView(originalRow);
      const tr = document.createElement("tr");

      const values = [
        row.display_name,
        row.type,
        row.frequency_display,
        row.channel,
        row.latitude,
        row.longitude,
        row.direction
      ];

      for (const value of values) {
        const td = document.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      }

      const actionTd = document.createElement("td");
      const showBtn = document.createElement("button");
      showBtn.textContent = "Karte";
      showBtn.className = "show-map-btn";
      showBtn.disabled = row.latitude === "" || row.longitude === "";

      showBtn.addEventListener("click", () => {
        if (row.latitude === "" || row.longitude === "") return;
        window.beaconsApi.openMapWindow(row.latitude, row.longitude);
      });

      actionTd.appendChild(showBtn);
      tr.appendChild(actionTd);

      tbody.appendChild(tr);
    }

    summary.textContent = `${rows.length} Einträge angezeigt`;
  }

  function matchesGlobalFilter(mappedRow, query) {
    const q = query.trim().toLowerCase();
    if (!q) return true;

    return [
      mappedRow.display_name,
      mappedRow.type,
      mappedRow.frequency_display,
      mappedRow.channel,
      mappedRow.latitude,
      mappedRow.longitude,
      mappedRow.direction
    ]
      .join(" ")
      .toLowerCase()
      .includes(q);
  }

  function matchesColumnFilters(mappedRow) {
    for (const [key, selectedValues] of Object.entries(currentColumnFilters)) {
      if (selectedValues === null) continue;

      const cellValue = String(mappedRow[key] ?? "");
      if (!selectedValues.has(cellValue)) {
        return false;
      }
    }
    return true;
  }

  function getFilteredRows(rows) {
    return rows.filter((row) => {
      const mapped = mapBeaconForView(row);
      return (
        matchesGlobalFilter(mapped, currentGlobalFilter) &&
        matchesColumnFilters(mapped)
      );
    });
  }

  function getSortedRows(rows) {
    if (!currentSort.key) return [...rows];

    return [...rows].sort((a, b) => {
      const A = mapBeaconForView(a);
      const B = mapBeaconForView(b);

      let valA = A[currentSort.key];
      let valB = B[currentSort.key];

      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;

      if (typeof valA === "number" && typeof valB === "number") {
        return (valA - valB) * currentSort.direction;
      }

      const numA = Number(valA);
      const numB = Number(valB);
      const bothNumericStrings =
        !Number.isNaN(numA) &&
        !Number.isNaN(numB) &&
        String(valA).trim() !== "" &&
        String(valB).trim() !== "";

      if (bothNumericStrings) {
        return (numA - numB) * currentSort.direction;
      }

      return (
        String(valA).localeCompare(String(valB), "de", { sensitivity: "base" }) *
        currentSort.direction
      );
    });
  }

  function updateHeaderIndicators() {
    headers.forEach((th) => {
      th.classList.remove("filtered", "sorted-asc", "sorted-desc");

      const headerKey = th.dataset.key;
      const filterKey = headerKeyToFilterKey[headerKey];

      if (currentColumnFilters[filterKey] !== null) {
        th.classList.add("filtered");
      }

      if (currentSort.key === headerKey) {
        th.classList.add(currentSort.direction === 1 ? "sorted-asc" : "sorted-desc");
      }
    });
  }

  function applyView() {
    const filtered = getFilteredRows(allBeacons);
    const sorted = getSortedRows(filtered);
    updateHeaderIndicators();
    renderRows(sorted);
  }

  function resetAllColumnFilters() {
    currentColumnFilters = {
      display_name: null,
      type: null,
      frequency_display: null,
      channel: null,
      latitude: null,
      longitude: null,
      direction: null
    };
  }

  function setSort(key, direction) {
    currentSort.key = key;
    currentSort.direction = direction;
    applyView();
  }

  function closeFilterMenu() {
    if (openFilterMenu) {
      openFilterMenu.remove();
      openFilterMenu = null;
    }
  }

  function getDistinctValues(filterKey) {
    const values = allBeacons.map((row) => String(mapBeaconForView(row)[filterKey] ?? ""));
    return [...new Set(values)].sort((a, b) =>
      a.localeCompare(b, "de", { sensitivity: "base" })
    );
  }

  function createCheckboxRow(labelText, checked, onChange) {
    const label = document.createElement("label");
    label.className = "filter-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.addEventListener("change", onChange);

    const text = document.createElement("span");
    text.textContent = labelText === "" ? "(leer)" : labelText;

    label.appendChild(checkbox);
    label.appendChild(text);

    return { label, checkbox };
  }

  function openColumnFilterMenu(th) {
    closeFilterMenu();

    const headerKey = th.dataset.key;
    const filterKey = headerKeyToFilterKey[headerKey];
    const values = getDistinctValues(filterKey);

    const menu = document.createElement("div");
    menu.className = "filter-menu";

    const title = document.createElement("div");
    title.className = "filter-menu-title";
    title.textContent = th.textContent.trim();

    const sortActions = document.createElement("div");
    sortActions.className = "filter-menu-actions";

    const sortAscBtn = document.createElement("button");
    sortAscBtn.type = "button";
    sortAscBtn.textContent = "Aufsteigend sortieren";

    const sortDescBtn = document.createElement("button");
    sortDescBtn.type = "button";
    sortDescBtn.textContent = "Absteigend sortieren";

    sortActions.appendChild(sortAscBtn);
    sortActions.appendChild(sortDescBtn);

    const selectionActions = document.createElement("div");
    selectionActions.className = "filter-menu-actions";

    const selectAllBtn = document.createElement("button");
    selectAllBtn.type = "button";
    selectAllBtn.textContent = "Alle";

    const clearAllBtn = document.createElement("button");
    clearAllBtn.type = "button";
    clearAllBtn.textContent = "Keine";

    selectionActions.appendChild(selectAllBtn);
    selectionActions.appendChild(clearAllBtn);

    const list = document.createElement("div");
    list.className = "filter-menu-list";

    let workingSelection =
      currentColumnFilters[filterKey] === null
        ? new Set(values)
        : new Set(currentColumnFilters[filterKey]);

    const itemCheckboxes = [];
    const valueByCheckbox = new Map();

    values.forEach((value) => {
      const isChecked = workingSelection.has(value);

      const row = createCheckboxRow(value, isChecked, (e) => {
        if (e.target.checked) {
          workingSelection.add(value);
        } else {
          workingSelection.delete(value);
        }
      });

      itemCheckboxes.push(row.checkbox);
      valueByCheckbox.set(row.checkbox, value);
      list.appendChild(row.label);
    });

    selectAllBtn.addEventListener("click", () => {
      workingSelection = new Set(values);
      itemCheckboxes.forEach((cb) => {
        cb.checked = true;
      });
    });

    clearAllBtn.addEventListener("click", () => {
      workingSelection = new Set();
      itemCheckboxes.forEach((cb) => {
        cb.checked = false;
      });
    });

    sortAscBtn.addEventListener("click", () => {
      setSort(headerKey, 1);
      closeFilterMenu();
    });

    sortDescBtn.addEventListener("click", () => {
      setSort(headerKey, -1);
      closeFilterMenu();
    });

    const footer = document.createElement("div");
    footer.className = "filter-menu-footer";

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.textContent = "Zurücksetzen";

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.textContent = "OK";
    applyBtn.className = "primary";

    footer.appendChild(resetBtn);
    footer.appendChild(applyBtn);

    resetBtn.addEventListener("click", () => {
      currentColumnFilters[filterKey] = null;
      closeFilterMenu();
      applyView();
    });

    applyBtn.addEventListener("click", () => {
      const selectedValues = new Set(
        itemCheckboxes
          .filter((cb) => cb.checked)
          .map((cb) => valueByCheckbox.get(cb))
      );

      if (selectedValues.size === values.length) {
        currentColumnFilters[filterKey] = null;
      } else {
        currentColumnFilters[filterKey] = selectedValues;
      }

      closeFilterMenu();
      applyView();
    });

    menu.appendChild(title);
    menu.appendChild(sortActions);
    menu.appendChild(selectionActions);
    menu.appendChild(list);
    menu.appendChild(footer);

    document.body.appendChild(menu);
    openFilterMenu = menu;

    const rect = th.getBoundingClientRect();
    const menuWidth = 280;
    const left = Math.min(
      window.innerWidth - menuWidth - 12,
      Math.max(12, rect.left)
    );

    menu.style.left = `${left}px`;
    menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
    menu.dataset.forKey = headerKey;
  }

  async function handleOpenFile() {
    if (!window.beaconsApi || typeof window.beaconsApi.openBeaconFile !== "function") {
      summary.textContent = "Fehler: Datei-API wurde nicht geladen.";
      return;
    }

    try {
      const result = await window.beaconsApi.openBeaconFile();

      if (result.canceled) {
        return;
      }

      allBeacons = result.beacons;
      currentFile.textContent = result.filePath || "";
      currentGlobalFilter = "";
      searchInput.value = "";
      resetAllColumnFilters();
      closeFilterMenu();
      applyView();
    } catch (err) {
      summary.textContent = `Fehler: ${err.message}`;
      console.error(err);
    }
  }

  openFileBtn.addEventListener("click", handleOpenFile);

  if (window.beaconsApi.onMenuOpenFile) {
    window.beaconsApi.onMenuOpenFile(() => {
      handleOpenFile();
    });
  }

  headers.forEach((th) => {
    th.addEventListener("click", () => {
      if (!allBeacons.length) return;

      if (openFilterMenu && openFilterMenu.dataset.forKey === th.dataset.key) {
        closeFilterMenu();
        return;
      }
      openColumnFilterMenu(th);
    });
  });

  document.addEventListener("click", (e) => {
    if (!openFilterMenu) return;

    const clickedInMenu = openFilterMenu.contains(e.target);
    const clickedHeader = e.target.closest("#beaconsTable thead th");

    if (!clickedInMenu && !clickedHeader) {
      closeFilterMenu();
    }
  });

  openFileBtn.addEventListener("click", handleOpenFile);

  searchInput.addEventListener("input", (e) => {
    currentGlobalFilter = e.target.value;
    applyView();
  });

  summary.textContent = "Noch keine Datei geladen";
});
