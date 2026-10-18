(() => {
  "use strict";

  const data = window.ROAM_DATA;
  const geo = window.ROAM_GEO;
  const topology = window.ROAM_TOPOLOGY;
  const toFeature = window.ROAM_TO_FEATURE;
  const toMesh = window.ROAM_TO_MESH;

  if (!data || !geo || !topology || !toFeature || !toMesh) {
    document.body.innerHTML =
      '<div class="static-load-error">静态地图资源加载失败，请确认本目录中的文件完整。</div>';
    return;
  }

  const destinations = data.destinations;
  const regions = data.regions;
  const leaves = data.leafRegions;
  const themes = data.themes;
  const world = toFeature(topology, topology.objects.countries);
  const worldLand = toFeature(topology, topology.objects.land);
  const borders = toMesh(
    topology,
    topology.objects.countries,
    (left, right) => left !== right,
  );
  const sphere = { type: "Sphere" };
  const graticule = geo.geoGraticule10();
  const destinationsById = new Map(destinations.map((item) => [item.id, item]));
  const regionsByCode = new Map(regions.map((item) => [item.code, item]));
  const leavesByCode = new Map(leaves.map((item) => [item.code, item]));
  const featureKey = (feature) =>
    feature.id === undefined
      ? `NE:${feature.properties?.name || "Unknown"}`
      : String(feature.id).padStart(3, "0");
  const featuresById = new Map(
    world.features.map((feature) => [featureKey(feature), feature]),
  );
  const countryNameById = new Map(Object.entries(data.countryNames));
  const placementByCountry = new Map();

  const chinaFeature = featuresById.get("156");
  const taiwanFeature = featuresById.get("158");
  if (chinaFeature && taiwanFeature) {
    featuresById.set("156", {
      ...chinaFeature,
      geometry: {
        type: "GeometryCollection",
        geometries: [chinaFeature.geometry, taiwanFeature.geometry],
      },
    });
    featuresById.delete("158");
  }

  leaves.forEach((leaf) => {
    (data.countryIdsByLeaf[leaf.code] || []).forEach((countryId) => {
      placementByCountry.set(countryId, {
        regionCode: leaf.regionCode,
        leafCode: leaf.code,
      });
    });
  });
  placementByCountry.set("010", { regionCode: "010", leafCode: null });
  placementByCountry.set("158", { regionCode: "142", leafCode: "030" });

  const $ = (id) => document.getElementById(id);
  const dom = {};
  [
    "brand-home", "search-form", "search-input", "search-clear", "search-submit",
    "search-results", "history-count", "favorites-count", "destination-total",
    "globe-stage", "globe-canvas", "scanline", "axis-lat", "axis-lon",
    "region-focus", "region-code", "region-name", "region-meta", "country-selection",
    "country-selection-name", "locked-label", "locked-coordinates",
    "destination-beacon", "beacon-city", "beacon-country", "globe-status",
    "globe-hint", "ticker", "control-card", "control-title", "control-copy",
    "mobile-filter-open", "mobile-filter-label", "mobile-pool-count",
    "mobile-filter-backdrop", "filters", "mobile-filter-close",
    "mobile-filter-apply", "mobile-filter-apply-meta", "region-fieldset",
    "region-grid", "subregion-fieldset", "subregion-legend", "subregion-grid",
    "theme-fieldset", "theme-grid", "pool-count", "scope-count", "result",
    "result-kicker", "result-city", "result-tagline", "result-season",
    "result-days", "result-budget", "favorite-button", "inspiration-toggle",
    "highlights", "launch-button", "launch-icon", "launch-label", "launch-meta",
    "reset-button", "distance-label", "drawer-backdrop", "drawer-close",
    "drawer-title", "drawer-list",
  ].forEach((id) => {
    dom[id] = $(id);
  });

  const getStored = (key) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value.filter((id) => destinationsById.has(id)) : [];
    } catch {
      return [];
    }
  };
  const setStored = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Some file:// privacy modes disable localStorage.
    }
  };

  const state = {
    regionCode: "001",
    leafCode: null,
    theme: "随机",
    selected: null,
    spinning: false,
    detailsOpen: false,
    favorites: getStored("roam-favorites"),
    history: getStored("roam-history"),
    drawer: null,
    mobileFiltersOpen: false,
    clickedCountryId: null,
    searchResults: [],
  };

  const activeRegion = () => regionsByCode.get(state.regionCode);
  const activeScope = () =>
    state.leafCode ? leavesByCode.get(state.leafCode) : activeRegion();
  const matchesScope = (
    item,
    regionCode = state.regionCode,
    leafCode = state.leafCode,
  ) => {
    if (regionCode === "001") return true;
    const placement = placementByCountry.get(item.countryId);
    if (!placement || placement.regionCode !== regionCode) return false;
    return leafCode === null || placement.leafCode === leafCode;
  };
  let cachedScopePool = destinations;
  let cachedCurrentPool = destinations;
  let cachedCountryIds = new Set();
  const refreshPoolCache = () => {
    cachedScopePool = destinations.filter((item) => matchesScope(item));
    cachedCurrentPool =
      state.theme === "随机"
        ? cachedScopePool
        : cachedScopePool.filter((item) => item.type === state.theme);
    cachedCountryIds = new Set(idsForScope());
  };
  const scopePool = () => cachedScopePool;
  const currentPool = () => cachedCurrentPool;
  const countInScope = (regionCode, leafCode) =>
    destinations.filter((item) => matchesScope(item, regionCode, leafCode)).length;
  const idsForScope = () => {
    if (state.leafCode) return data.countryIdsByLeaf[state.leafCode] || [];
    if (state.regionCode === "001") {
      return leaves.flatMap((leaf) => data.countryIdsByLeaf[leaf.code] || []);
    }
    if (state.regionCode === "010") return ["010"];
    return (activeRegion().children || []).flatMap(
      (code) => data.countryIdsByLeaf[code] || [],
    );
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const shortestLongitude = (from, to) => ((to - from + 540) % 360) - 180;
  const radians = Math.PI / 180;
  const formatLatitude = (value) =>
    `${Math.abs(Number(value.toFixed(2)))}°${value >= 0 ? "N" : "S"}`;
  const formatLongitude = (value) =>
    `${Math.abs(Number(value.toFixed(2)))}°${value >= 0 ? "E" : "W"}`;
  const setTicker = (text) => {
    dom["ticker"].textContent = text;
  };
  const distanceToShanghai = (destination) => {
    const earthRadius = 6371;
    const lat1 = 31.23 * radians;
    const lat2 = destination.lat * radians;
    const deltaLat = lat2 - lat1;
    const deltaLon = (destination.lon - 121.47) * radians;
    const value =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
    return Math.round(
      earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)),
    );
  };

  let manualCamera = null;

  const createChip = ({ label, meta, active, disabled, ariaLabel, onClick }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.toggle("active", active);
    button.disabled = disabled;
    button.setAttribute("aria-pressed", String(active));
    if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
    const text = document.createElement("span");
    text.textContent = label;
    const small = document.createElement("small");
    small.textContent = meta;
    button.append(text, small);
    button.addEventListener("click", onClick);
    return button;
  };

  const chooseRegion = (code) => {
    if (state.spinning) return;
    state.regionCode = code;
    state.leafCode = null;
    if (
      state.theme !== "随机" &&
      !destinations.some(
        (item) => item.type === state.theme && matchesScope(item, code, null),
      )
    ) {
      state.theme = "随机";
    }
    state.clickedCountryId = null;
    manualCamera = null;
    setTicker(code === "001" ? "全球视野已恢复" : `${activeRegion().name}视野正在对焦`);
    render();
  };

  const chooseLeaf = (code) => {
    if (state.spinning) return;
    state.leafCode = code;
    if (
      state.theme !== "随机" &&
      !destinations.some(
        (item) =>
          item.type === state.theme &&
          matchesScope(item, state.regionCode, code),
      )
    ) {
      state.theme = "随机";
    }
    state.clickedCountryId = null;
    manualCamera = null;
    setTicker(code ? `${activeScope().name}视野正在对焦` : `${activeRegion().name}全域视野已恢复`);
    render();
  };

  const chooseTheme = (theme) => {
    if (state.spinning) return;
    state.theme = theme;
    setTicker(theme === "随机" ? "所有旅行灵感已启用" : `只抽取「${theme}」目的地`);
    render();
  };

  const renderFilters = () => {
    const region = activeRegion();
    const scope = activeScope();
    const scoped = scopePool();
    const pool = currentPool();

    dom["region-grid"].replaceChildren();
    regions.forEach((item) => {
      const current = countInScope(item.code, null);
      dom["region-grid"].append(
        createChip({
          label: item.shortName,
          meta: item.quota ? `${current}/${item.quota}` : "暂不开放",
          active: state.regionCode === item.code,
          disabled: current === 0 || state.spinning,
          ariaLabel: `${item.name}，当前 ${current} 个坐标，规划名额 ${item.quota}`,
          onClick: () => chooseRegion(item.code),
        }),
      );
    });

    const children = (region.children || []).map((code) => leavesByCode.get(code));
    dom["subregion-fieldset"].hidden = children.length === 0;
    dom["subregion-grid"].replaceChildren();
    if (children.length) {
      dom["subregion-legend"].textContent = `${region.name} · 最细层级`;
      dom["subregion-grid"].append(
        createChip({
          label: "全部",
          meta: `${scoped.length}/${region.quota}`,
          active: state.leafCode === null,
          disabled: state.spinning,
          onClick: () => chooseLeaf(null),
        }),
      );
      children.forEach((item) => {
        const current = countInScope(item.regionCode, item.code);
        dom["subregion-grid"].append(
          createChip({
            label: item.name,
            meta: `${current}/${item.quota}`,
            active: state.leafCode === item.code,
            disabled: current === 0 || state.spinning,
            onClick: () => chooseLeaf(item.code),
          }),
        );
      });
    }

    dom["theme-grid"].replaceChildren();
    themes.forEach((theme) => {
      const current =
        theme === "随机"
          ? scoped.length
          : scoped.filter((item) => item.type === theme).length;
      dom["theme-grid"].append(
        createChip({
          label: theme,
          meta: String(current),
          active: state.theme === theme,
          disabled: current === 0 || state.spinning,
          onClick: () => chooseTheme(theme),
        }),
      );
    });

    dom["pool-count"].textContent = String(pool.length);
    dom["scope-count"].textContent =
      `${scope.name} · 当前 ${scoped.length} / 规划 ${scope.quota}`;
    dom["mobile-filter-label"].textContent = `${scope.name} · ${state.theme}`;
    dom["mobile-pool-count"].textContent = String(pool.length);
    dom["mobile-filter-apply-meta"].textContent =
      `${scope.name} · ${state.theme} · ${pool.length} 个坐标`;
    dom["region-fieldset"].disabled = state.spinning;
    dom["theme-fieldset"].disabled = state.spinning;
  };

  const renderResult = () => {
    const selected = state.selected;
    dom["result"].hidden = !selected;
    dom["reset-button"].hidden = !selected;
    dom["mobile-filter-open"].hidden = Boolean(selected);
    dom["filters"].hidden = Boolean(selected);

    if (!selected) {
      dom["control-title"].textContent = "设置随机半径";
      dom["control-copy"].textContent =
        "先按联合国 M49 选择地域，再让地球在真实匹配中做决定。";
      return;
    }

    dom["control-title"].textContent = "坐标已锁定";
    dom["control-copy"].textContent =
      "地球替你做了决定。国家轮廓与城市坐标已经确认。";
    dom["result"].style.setProperty("--accent", selected.accent);
    dom["result-kicker"].textContent = `${selected.country} · ${selected.type}`;
    dom["result-city"].textContent = selected.city;
    dom["result-tagline"].textContent = `“${selected.tagline}”`;
    dom["result-season"].textContent = selected.season;
    dom["result-days"].textContent = selected.days;
    dom["result-budget"].textContent = selected.budget;

    const favorite = state.favorites.includes(selected.id);
    dom["favorite-button"].classList.toggle("saved", favorite);
    dom["favorite-button"].textContent = favorite ? "★" : "☆";
    dom["favorite-button"].setAttribute(
      "aria-label",
      favorite ? "取消收藏" : "收藏目的地",
    );
    dom["inspiration-toggle"].setAttribute("aria-expanded", String(state.detailsOpen));
    dom["inspiration-toggle"].querySelector("span").textContent =
      state.detailsOpen ? "收起 ↗" : "展开 ↗";
    dom["highlights"].hidden = !state.detailsOpen;
    dom["highlights"].replaceChildren();
    selected.highlights.forEach((item, index) => {
      const row = document.createElement("li");
      const number = document.createElement("span");
      number.textContent = String(index + 1).padStart(2, "0");
      row.append(number, document.createTextNode(item));
      dom["highlights"].append(row);
    });
  };

  const renderGlobeLabels = () => {
    const scope = activeScope();
    const preset = scope.preset;
    const scoped = scopePool();
    dom["axis-lat"].textContent = formatLatitude(preset.lat);
    dom["axis-lon"].textContent = formatLongitude(preset.lon);
    dom["globe-stage"].classList.toggle("is-region-focused", scope.code !== "001");
    dom["globe-stage"].classList.toggle("has-result", Boolean(state.selected));
    dom["globe-canvas"].classList.toggle("is-spinning", state.spinning);
    dom["scanline"].classList.toggle("active", state.spinning);

    dom["region-focus"].hidden = scope.code === "001" || Boolean(state.selected);
    dom["region-code"].textContent = `${preset.code} FOCUS`;
    dom["region-name"].textContent = scope.name;
    dom["region-meta"].textContent =
      `${preset.subtitle} · ${scoped.length}/${scope.quota} 个坐标`;

    dom["country-selection"].hidden =
      !state.clickedCountryId || Boolean(state.selected);
    if (state.clickedCountryId) {
      dom["country-selection-name"].textContent =
        countryNameById.get(state.clickedCountryId) ||
        "未知地域";
    }

    if (state.selected) {
      dom["locked-label"].hidden = false;
      dom["locked-label"].style.setProperty("--accent", state.selected.accent);
      dom["locked-coordinates"].textContent =
        `LOCKED · ${state.selected.lat.toFixed(2)}°, ${state.selected.lon.toFixed(2)}°`;
      dom["destination-beacon"].hidden = false;
      dom["destination-beacon"].style.setProperty("--accent", state.selected.accent);
      dom["beacon-city"].textContent = state.selected.city;
      dom["beacon-country"].textContent =
        `${state.selected.country} · ${state.selected.type}`;
      dom["globe-status"].hidden = true;
    } else {
      dom["locked-label"].hidden = true;
      dom["destination-beacon"].hidden = true;
      dom["globe-status"].hidden = false;
      dom["globe-hint"].textContent = state.spinning
        ? `正在扫描${scope.name}坐标`
        : scope.code === "001"
          ? "点击国家查看名称 · 拖动旋转"
          : `${scope.name}已锁定 · 点击国家查看名称`;
    }
  };

  const renderActions = () => {
    const pool = currentPool();
    dom["launch-button"].disabled = state.spinning || pool.length === 0;
    dom["launch-icon"].textContent = state.spinning ? "···" : pool.length ? "↗" : "—";
    dom["launch-label"].textContent = state.spinning
      ? "正在扫描地球"
      : pool.length === 0
        ? "当前组合暂无坐标"
        : state.selected
          ? "换一个目的地"
          : "转动地球";
    dom["launch-meta"].textContent = state.spinning
      ? `SEARCHING ${activeScope().preset.code}`
      : pool.length === 0
        ? "ADJUST FILTERS"
        : "LET THE EARTH DECIDE";
    dom["distance-label"].textContent = state.selected
      ? `${distanceToShanghai(state.selected).toLocaleString("zh-CN")} KM FROM SHANGHAI`
      : activeScope().code === "001"
        ? "THE WORLD IS WIDER THAN THE PLAN"
        : `${activeScope().preset.code} VIEW · CAMERA FOCUSED`;
  };

  const render = () => {
    refreshPoolCache();
    renderFilters();
    renderResult();
    renderGlobeLabels();
    renderActions();
    dom["destination-total"].textContent = String(destinations.length);
    dom["history-count"].textContent = String(state.history.length);
    dom["favorites-count"].textContent = String(state.favorites.length);
    requestDraw();
  };

  let pickInterval = 0;
  let pickTimeout = 0;

  const closeSearch = () => {
    dom["search-results"].hidden = true;
    dom["search-input"].setAttribute("aria-expanded", "false");
  };

  const selectDestination = (
    destination,
    { resetScope = false, remember = true } = {},
  ) => {
    clearInterval(pickInterval);
    clearTimeout(pickTimeout);
    state.spinning = false;
    if (resetScope) {
      state.regionCode = "001";
      state.leafCode = null;
      state.theme = "随机";
    }
    state.selected = destination;
    state.detailsOpen = false;
    state.clickedCountryId = null;
    manualCamera = null;
    setTicker(`${destination.country} · ${destination.city}`);
    if (remember) {
      state.history = [
        destination.id,
        ...state.history.filter((id) => id !== destination.id),
      ].slice(0, 8);
      setStored("roam-history", state.history);
    }
    closeSearch();
    closeMobileFilters();
    render();
    if (window.matchMedia("(max-width: 680px)").matches) {
      requestAnimationFrame(() => {
        dom["globe-stage"].scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
          block: "center",
        });
      });
    }
  };

  const runPick = () => {
    const pool = currentPool();
    if (state.spinning || !pool.length) return;
    closeMobileFilters();
    state.spinning = true;
    state.selected = null;
    state.detailsOpen = false;
    state.clickedCountryId = null;
    manualCamera = null;
    render();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    pickInterval = window.setInterval(() => {
      const candidate = pool[Math.floor(Math.random() * pool.length)];
      setTicker(`${candidate.country} · ${candidate.city}`);
    }, reduced ? 120 : 78);
    pickTimeout = window.setTimeout(
      () => {
        clearInterval(pickInterval);
        selectDestination(pool[Math.floor(Math.random() * pool.length)]);
      },
      reduced ? 520 : 2350,
    );
  };

  const resetPreferences = () => {
    state.selected = null;
    state.detailsOpen = false;
    manualCamera = null;
    setTicker(
      activeScope().code === "001"
        ? "等待一次心血来潮"
        : `${activeScope().name}视野已恢复`,
    );
    render();
    if (window.matchMedia("(max-width: 680px)").matches) openMobileFilters();
  };

  const scoreSearch = (item, query) => {
    const city = item.city.toLocaleLowerCase("zh-CN");
    const country = item.country.toLocaleLowerCase("zh-CN");
    const type = item.type.toLocaleLowerCase("zh-CN");
    const highlights = item.highlights.join(" ").toLocaleLowerCase("zh-CN");
    if (city === query) return 120;
    if (city.startsWith(query)) return 105;
    if (city.includes(query)) return 90;
    if (country === query) return 80;
    if (country.startsWith(query)) return 72;
    if (country.includes(query)) return 64;
    if (type === query) return 56;
    if (type.includes(query)) return 48;
    if (highlights.includes(query)) return 36;
    return 0;
  };

  const renderSearch = () => {
    const query = dom["search-input"].value.trim().toLocaleLowerCase("zh-CN");
    state.searchResults = query
      ? destinations
          .map((item) => ({ item, score: scoreSearch(item, query) }))
          .filter(({ score }) => score > 0)
          .sort(
            (left, right) =>
              right.score - left.score ||
              left.item.city.localeCompare(right.item.city, "zh-CN"),
          )
          .slice(0, 7)
          .map(({ item }) => item)
      : [];
    dom["search-clear"].style.display = dom["search-input"].value ? "" : "none";
    dom["search-submit"].disabled = !state.searchResults.length;
    dom["search-results"].replaceChildren();
    if (!query) {
      closeSearch();
      return;
    }
    if (!state.searchResults.length) {
      const empty = document.createElement("div");
      empty.className = "search-empty";
      empty.textContent = "没有找到匹配坐标，换个关键词试试";
      dom["search-results"].append(empty);
    } else {
      state.searchResults.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "search-result";
        button.setAttribute("role", "option");
        const copy = document.createElement("span");
        const city = document.createElement("strong");
        city.textContent = item.city;
        const meta = document.createElement("small");
        meta.textContent = `${item.country} · ${item.type}`;
        copy.append(city, meta);
        const coordinates = document.createElement("i");
        coordinates.textContent =
          `${formatLatitude(item.lat)} · ${formatLongitude(item.lon)}`;
        button.append(copy, coordinates);
        button.addEventListener("pointerdown", (event) => event.preventDefault());
        button.addEventListener("click", () =>
          selectDestination(item, { resetScope: true }),
        );
        dom["search-results"].append(button);
      });
    }
    dom["search-results"].hidden = false;
    dom["search-input"].setAttribute("aria-expanded", "true");
  };

  const openDrawer = (kind) => {
    state.drawer = kind;
    dom["drawer-title"].textContent = kind === "favorites" ? "收藏坐标" : "旅行足迹";
    const ids = kind === "favorites" ? state.favorites : state.history;
    const items = ids.map((id) => destinationsById.get(id)).filter(Boolean);
    dom["drawer-list"].replaceChildren();
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      const symbol = document.createElement("span");
      symbol.textContent = "◎";
      const title = document.createElement("strong");
      title.textContent = "这里还没有坐标";
      const copy = document.createElement("p");
      copy.textContent = "去转动一次地球，让旅程从偶然开始。";
      empty.append(symbol, title, copy);
      dom["drawer-list"].append(empty);
    } else {
      items.forEach((item, index) => {
        const button = document.createElement("button");
        button.type = "button";
        const number = document.createElement("span");
        number.textContent = String(index + 1).padStart(2, "0");
        const copy = document.createElement("div");
        const city = document.createElement("strong");
        city.textContent = item.city;
        const meta = document.createElement("small");
        meta.textContent = `${item.country} · ${item.type}`;
        copy.append(city, meta);
        const arrow = document.createElement("i");
        arrow.textContent = "↗";
        button.append(number, copy, arrow);
        button.addEventListener("click", () => {
          closeDrawer();
          selectDestination(item, { remember: false });
        });
        dom["drawer-list"].append(button);
      });
    }
    dom["drawer-backdrop"].hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => dom["drawer-close"].focus());
  };

  const closeDrawer = () => {
    if (!state.drawer) return;
    state.drawer = null;
    dom["drawer-backdrop"].hidden = true;
    document.body.style.overflow = "";
  };

  function openMobileFilters() {
    if (!window.matchMedia("(max-width: 680px)").matches) return;
    state.mobileFiltersOpen = true;
    dom["control-card"].classList.add("mobile-filters-open");
    dom["mobile-filter-open"].setAttribute("aria-expanded", "true");
    dom["mobile-filter-backdrop"].hidden = false;
    dom["filters"].setAttribute("role", "dialog");
    dom["filters"].setAttribute("aria-modal", "true");
    dom["filters"].setAttribute("aria-labelledby", "filter-dialog-title");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => dom["mobile-filter-close"].focus());
  }

  function closeMobileFilters() {
    if (!state.mobileFiltersOpen) return;
    state.mobileFiltersOpen = false;
    dom["control-card"].classList.remove("mobile-filters-open");
    dom["mobile-filter-open"].setAttribute("aria-expanded", "false");
    dom["mobile-filter-backdrop"].hidden = true;
    dom["filters"].removeAttribute("role");
    dom["filters"].removeAttribute("aria-modal");
    dom["filters"].removeAttribute("aria-labelledby");
    document.body.style.overflow = "";
  }

  dom["brand-home"].addEventListener("click", () =>
    window.scrollTo({ top: 0, behavior: "smooth" }),
  );
  dom["launch-button"].addEventListener("click", runPick);
  dom["reset-button"].addEventListener("click", resetPreferences);
  dom["favorite-button"].addEventListener("click", () => {
    if (!state.selected) return;
    state.favorites = state.favorites.includes(state.selected.id)
      ? state.favorites.filter((id) => id !== state.selected.id)
      : [...state.favorites, state.selected.id];
    setStored("roam-favorites", state.favorites);
    render();
  });
  dom["inspiration-toggle"].addEventListener("click", () => {
    state.detailsOpen = !state.detailsOpen;
    renderResult();
  });
  dom["search-input"].addEventListener("input", renderSearch);
  dom["search-input"].addEventListener("focus", renderSearch);
  dom["search-input"].addEventListener("blur", () => setTimeout(closeSearch, 120));
  dom["search-input"].addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSearch();
  });
  dom["search-clear"].addEventListener("click", () => {
    dom["search-input"].value = "";
    renderSearch();
    dom["search-input"].focus();
  });
  dom["search-form"].addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.searchResults[0]) {
      selectDestination(state.searchResults[0], { resetScope: true });
    } else if (dom["search-input"].value.trim()) {
      setTicker(`没有找到“${dom["search-input"].value.trim()}”`);
    }
  });
  document.querySelectorAll("[data-drawer]").forEach((button) => {
    button.addEventListener("click", () => openDrawer(button.dataset.drawer));
  });
  dom["drawer-close"].addEventListener("click", closeDrawer);
  dom["drawer-backdrop"].addEventListener("pointerdown", (event) => {
    if (event.target === dom["drawer-backdrop"]) closeDrawer();
  });
  dom["mobile-filter-open"].addEventListener("click", openMobileFilters);
  dom["mobile-filter-close"].addEventListener("click", closeMobileFilters);
  dom["mobile-filter-apply"].addEventListener("click", closeMobileFilters);
  dom["mobile-filter-backdrop"].addEventListener("click", closeMobileFilters);
  window.matchMedia("(max-width: 680px)").addEventListener("change", (event) => {
    if (!event.matches) closeMobileFilters();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (state.mobileFiltersOpen) closeMobileFilters();
    else if (state.drawer) closeDrawer();
  });

  // Stable, full-viewport globe ---------------------------------------------

  const canvas = dom["globe-canvas"];
  const context = canvas.getContext("2d", { alpha: true });
  const projection = geo.geoOrthographic().clipAngle(90).precision(0.35);
  const path = geo.geoPath(projection, context);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const camera = { lon: 20, lat: 10, zoom: 1 };
  const drag = {
    active: false,
    moved: false,
    x: 0,
    y: 0,
    startX: 0,
    startY: 0,
  };
  let cssWidth = 1;
  let cssHeight = 1;
  let pixelRatio = 1;
  let lastFrame = performance.now();
  let frameRequest = 0;

  const resizeCanvas = () => {
    const rect = canvas.getBoundingClientRect();
    const nextWidth = Math.max(1, rect.width);
    const nextHeight = Math.max(1, rect.height);
    const pixelArea = nextWidth * nextHeight;
    const ratioCap = pixelArea > 1_500_000 ? 1.25 : 1.5;
    const nextRatio = Math.min(window.devicePixelRatio || 1, ratioCap);
    const pixelWidth = Math.round(nextWidth * nextRatio);
    const pixelHeight = Math.round(nextHeight * nextRatio);
    cssWidth = nextWidth;
    cssHeight = nextHeight;
    pixelRatio = nextRatio;
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      context.setTransform(nextRatio, 0, 0, nextRatio, 0, 0);
    }
  };

  const trace = (object) => {
    context.beginPath();
    path(object);
  };

  function requestDraw() {
    if (frameRequest || document.hidden) return;
    frameRequest = requestAnimationFrame(drawFrame);
  }

  const isVisible = (lon, lat) => {
    const lambda = (lon - camera.lon) * radians;
    const phi = lat * radians;
    const phi0 = camera.lat * radians;
    return (
      Math.sin(phi0) * Math.sin(phi) +
        Math.cos(phi0) * Math.cos(phi) * Math.cos(lambda) >
      0
    );
  };

  const drawFrame = (now) => {
    frameRequest = 0;
    const elapsed = Math.min(40, now - lastFrame);
    lastFrame = now;
    const scope = activeScope();
    const preset = scope.preset;
    let targetLon = manualCamera?.lon ?? preset.lon;
    let targetLat = manualCamera?.lat ?? preset.lat;
    let targetZoom = manualCamera?.zoom ?? preset.zoom;

    if (state.selected) {
      targetLon = state.selected.lon;
      targetLat = clamp(state.selected.lat, -68, 68);
      targetZoom = manualCamera?.zoom ?? 1.95;
    } else if (state.spinning) {
      targetLon = camera.lon + elapsed * 0.045;
      targetLat =
        scope.code === "001" ? 8 + Math.sin(now / 900) * 7 : preset.lat;
      targetZoom = 0.9;
    }

    if (!drag.active) {
      const ease = reducedMotion ? 1 : 1 - Math.exp(-elapsed / 185);
      camera.lon += shortestLongitude(camera.lon, targetLon) * ease;
      camera.lat += (targetLat - camera.lat) * ease;
      camera.zoom += (targetZoom - camera.zoom) * ease;
    }

    const centerX = cssWidth / 2;
    const centerY = cssHeight / 2;
    const radius = Math.min(cssWidth, cssHeight) * 0.365 * camera.zoom;
    projection
      .translate([centerX, centerY])
      .scale(radius)
      .rotate([-camera.lon, -camera.lat, 0]);

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);
    context.lineJoin = "round";
    context.lineCap = "round";

    const halo = context.createRadialGradient(
      centerX,
      centerY,
      radius * 0.7,
      centerX,
      centerY,
      radius * 1.2,
    );
    halo.addColorStop(0, "rgba(48,166,174,.17)");
    halo.addColorStop(0.75, "rgba(24,93,105,.07)");
    halo.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = halo;
    context.beginPath();
    context.arc(centerX, centerY, radius * 1.2, 0, Math.PI * 2);
    context.fill();

    const ocean = context.createRadialGradient(
      centerX - radius * 0.34,
      centerY - radius * 0.42,
      radius * 0.04,
      centerX,
      centerY,
      radius * 1.12,
    );
    ocean.addColorStop(0, "#3d8790");
    ocean.addColorStop(0.3, "#1c5661");
    ocean.addColorStop(0.7, "#0a2c38");
    ocean.addColorStop(1, "#020c14");
    trace(sphere);
    context.fillStyle = ocean;
    context.fill();

    context.save();
    trace(sphere);
    context.clip();
    trace(graticule);
    context.strokeStyle = "rgba(139,218,210,.12)";
    context.lineWidth = 0.68;
    context.stroke();

    trace(worldLand);
    const land = context.createLinearGradient(
      centerX - radius,
      centerY - radius,
      centerX + radius,
      centerY + radius,
    );
    land.addColorStop(0, "#81aa91");
    land.addColorStop(0.42, "#4d7969");
    land.addColorStop(1, "#203f3d");
    context.fillStyle = land;
    context.fill();

    if (scope.code !== "001" && !state.selected) {
      cachedCountryIds.forEach((id) => {
        const feature = featuresById.get(id);
        if (!feature) return;
        trace(feature);
        context.fillStyle = "rgba(211,194,133,.36)";
        context.fill();
        context.strokeStyle = "rgba(246,206,143,.74)";
        context.lineWidth = 0.85;
        context.stroke();
      });
    }

    if (state.clickedCountryId && !state.selected) {
      const feature = featuresById.get(state.clickedCountryId);
      if (feature) {
        trace(feature);
        context.shadowColor = "rgba(240,170,112,.88)";
        context.shadowBlur = 18;
        context.fillStyle = "rgba(240,170,112,.58)";
        context.fill();
        context.shadowBlur = 0;
        context.strokeStyle = "rgba(255,219,161,.98)";
        context.lineWidth = 1.45;
        context.stroke();
      }
    }

    if (state.selected) {
      const feature = featuresById.get(state.selected.countryId);
      if (feature) {
        trace(feature);
        context.shadowColor = state.selected.accent;
        context.shadowBlur = 18;
        context.fillStyle = `${state.selected.accent}66`;
        context.fill();
        context.shadowBlur = 0;
        context.strokeStyle = state.selected.accent;
        context.lineWidth = 1.2;
        context.stroke();
      }
    }

    trace(borders);
    context.strokeStyle = "rgba(210,230,218,.23)";
    context.lineWidth = 0.45;
    context.stroke();

    if (state.selected) {
      const item = state.selected;
      if (isVisible(item.lon, item.lat)) {
        const point = projection([item.lon, item.lat]);
        if (point) {
          context.fillStyle = item.accent;
          context.shadowColor = item.accent;
          context.shadowBlur = 14;
          context.beginPath();
          context.arc(point[0], point[1], 4.2, 0, Math.PI * 2);
          context.fill();
          context.shadowBlur = 0;
          context.strokeStyle = item.accent;
          context.lineWidth = 1;
          context.beginPath();
          context.arc(point[0], point[1], 11, 0, Math.PI * 2);
          context.stroke();
        }
      }
    }
    context.restore();

    trace(sphere);
    context.strokeStyle = "rgba(166,224,211,.44)";
    context.lineWidth = 1.1;
    context.stroke();

    const stillMoving =
      state.spinning ||
      Math.abs(shortestLongitude(camera.lon, targetLon)) > 0.015 ||
      Math.abs(camera.lat - targetLat) > 0.015 ||
      Math.abs(camera.zoom - targetZoom) > 0.001;
    if (stillMoving) requestDraw();
  };

  const pointInRing = ([queryLon, queryLat], ring) => {
    let inside = false;
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      let currentLon = ring[index][0];
      let previousLon = ring[previous][0];
      const currentLat = ring[index][1];
      const previousLat = ring[previous][1];
      while (currentLon - queryLon > 180) currentLon -= 360;
      while (currentLon - queryLon < -180) currentLon += 360;
      while (previousLon - queryLon > 180) previousLon -= 360;
      while (previousLon - queryLon < -180) previousLon += 360;
      const intersects =
        currentLat > queryLat !== previousLat > queryLat &&
        queryLon <
          ((previousLon - currentLon) * (queryLat - currentLat)) /
            (previousLat - currentLat || Number.EPSILON) +
            currentLon;
      if (intersects) inside = !inside;
    }
    return inside;
  };

  const containsPoint = (coordinate, feature) => {
    const geometry = feature.geometry;
    if (!geometry) return false;
    const polygons =
      geometry.type === "Polygon"
        ? [geometry.coordinates]
        : geometry.type === "MultiPolygon"
          ? geometry.coordinates
          : [];
    return polygons.some(
      (polygon) =>
        pointInRing(coordinate, polygon[0]) &&
        !polygon.slice(1).some((hole) => pointInRing(coordinate, hole)),
    );
  };

  const identifyCountry = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const coordinate = projection.invert([clientX - rect.left, clientY - rect.top]);
    if (!coordinate) {
      state.clickedCountryId = null;
      renderGlobeLabels();
      requestDraw();
      return;
    }
    const feature = world.features.find((item) => containsPoint(coordinate, item));
    const clickedKey = feature ? featureKey(feature) : null;
    state.clickedCountryId = clickedKey === "158" ? "156" : clickedKey;
    renderGlobeLabels();
    requestDraw();
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (state.spinning) return;
    drag.active = true;
    drag.moved = false;
    drag.x = drag.startX = event.clientX;
    drag.y = drag.startY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drag.active || state.spinning) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5) {
      drag.moved = true;
    }
    camera.lon -= (event.clientX - drag.x) * (0.24 / camera.zoom);
    camera.lat = clamp(
      camera.lat + (event.clientY - drag.y) * (0.2 / camera.zoom),
      -78,
      78,
    );
    manualCamera = { lon: camera.lon, lat: camera.lat, zoom: camera.zoom };
    drag.x = event.clientX;
    drag.y = event.clientY;
    requestDraw();
  });
  const finishDrag = (event) => {
    if (!drag.active) return;
    drag.active = false;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    if (!drag.moved && !state.spinning && !state.selected) {
      identifyCountry(event.clientX, event.clientY);
    }
    requestDraw();
  };
  canvas.addEventListener("pointerup", finishDrag);
  canvas.addEventListener("pointercancel", finishDrag);
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      camera.zoom = clamp(camera.zoom - event.deltaY * 0.00072, 0.72, 3.4);
      manualCamera = { lon: camera.lon, lat: camera.lat, zoom: camera.zoom };
      requestDraw();
    },
    { passive: false },
  );
  canvas.addEventListener("keydown", (event) => {
    const actions = {
      ArrowLeft: () => (camera.lon -= 7),
      ArrowRight: () => (camera.lon += 7),
      ArrowUp: () => (camera.lat = clamp(camera.lat + 6, -78, 78)),
      ArrowDown: () => (camera.lat = clamp(camera.lat - 6, -78, 78)),
      "+": () => (camera.zoom = clamp(camera.zoom + 0.15, 0.72, 3.4)),
      "=": () => (camera.zoom = clamp(camera.zoom + 0.15, 0.72, 3.4)),
      "-": () => (camera.zoom = clamp(camera.zoom - 0.15, 0.72, 3.4)),
    };
    const action = actions[event.key];
    if (!action || state.spinning) return;
    event.preventDefault();
    action();
    manualCamera = { lon: camera.lon, lat: camera.lat, zoom: camera.zoom };
    requestDraw();
  });

  if ("ResizeObserver" in window) {
    new ResizeObserver(() => {
      resizeCanvas();
      requestDraw();
    }).observe(canvas);
  } else {
    window.addEventListener("resize", () => {
      resizeCanvas();
      requestDraw();
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) requestDraw();
  });

  resizeCanvas();
  render();
  renderSearch();
})();
