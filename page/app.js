(async () => {
  const $ = (id) => document.getElementById(id);
  await magpie.ready;

  let opts = {};
  try { opts = (await magpie.options.get()) || {}; } catch {}

  const DEFAULTS = {
    prefixes: ["free", "ant", "次", "pro", "plus", "test", "beta", "stable", "限时"],
    suffixes: ["thinking", "latest", "preview", "\\d{4}-\\d{2}(-\\d{2})?"],
    aliases: {},
    freeTag: "free",
  };

  // inline SVG icons so they stay crisp and follow the theme color
  const SVG = "http://www.w3.org/2000/svg";
  function icon(paths, size = 14) {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("aria-hidden", "true");
    for (const d of paths) {
      const p = document.createElementNS(SVG, "path");
      p.setAttribute("d", d);
      svg.append(p);
    }
    return svg;
  }
  const iconX = () => icon(["M6 6l12 12", "M18 6L6 18"]);
  const iconPlus = () => icon(["M12 5v14", "M5 12h14"]);
  const iconArrow = () => icon(["M5 12h14", "M13 6l6 6-6 6"]);

  // ---- state ----
  const state = {
    prefixes: [...(opts.prefixes ?? DEFAULTS.prefixes)],
    suffixes: [...(opts.suffixes ?? DEFAULTS.suffixes)],
    aliases: Object.entries(opts.aliases ?? DEFAULTS.aliases).map(([k, v]) => ({ from: k, to: v })),
    freeTag: opts.freeTag ?? DEFAULTS.freeTag,
  };
  let saved = JSON.stringify(state);

  function markDirty(clearMessages = true) {
    const dirty = JSON.stringify(state) !== saved;
    $("dirty").hidden = !dirty;
    $("save").disabled = !dirty;
    if (clearMessages) {
      $("ok").hidden = true;
      $("error").hidden = true;
    }
  }

  // ---- chip lists (prefixes / suffixes) ----
  function renderChips(key, hostId, countId, placeholder) {
    const host = $(hostId);
    host.replaceChildren();

    state[key].forEach((value, i) => {
      const chip = document.createElement("span");
      chip.className = "chip";

      const label = document.createElement("span");
      label.className = "chip-label";
      label.textContent = value;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "chip-x";
      remove.append(iconX(12));
      remove.title = "删除";
      remove.setAttribute("aria-label", `删除 ${value}`);
      remove.addEventListener("click", () => {
        state[key].splice(i, 1);
        renderChips(key, hostId, countId, placeholder);
        markDirty();
      });

      // click the label to edit it in place
      label.addEventListener("click", () => {
        const input = document.createElement("input");
        input.className = "chip-edit";
        input.value = value;
        input.spellcheck = false;
        input.setAttribute("aria-label", `编辑 ${value}`);
        chip.replaceChildren(input);
        input.focus();
        input.select();

        const commit = (keep) => {
          const next = input.value.trim();
          if (keep && next) state[key][i] = next;
          else if (keep && !next) state[key].splice(i, 1);
          renderChips(key, hostId, countId, placeholder);
          markDirty();
        };
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(true); }
          if (e.key === "Escape") { e.preventDefault(); commit(false); }
        });
        input.addEventListener("blur", () => commit(true));
      });

      chip.append(label, remove);
      host.append(chip);
    });

    // trailing "add" chip: turns into an input on click
    const add = document.createElement("button");
    add.type = "button";
    add.className = "chip add";
    add.append(iconPlus(13));
    add.title = "添加";
    add.setAttribute("aria-label", `添加${key === "prefixes" ? "前缀" : "后缀"}`);
    add.addEventListener("click", () => {
      const input = document.createElement("input");
      input.className = "chip-edit";
      input.placeholder = placeholder;
      input.spellcheck = false;
      add.replaceWith(input);
      input.focus();

      let done = false;
      const commit = () => {
        if (done) return;
        done = true;
        const next = input.value.trim();
        if (next && !state[key].includes(next)) state[key].push(next);
        renderChips(key, hostId, countId, placeholder);
        markDirty();
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { e.preventDefault(); done = true; renderChips(key, hostId, countId, placeholder); }
      });
      input.addEventListener("blur", commit);
    });
    host.append(add);

    $(countId).textContent = state[key].length;
  }

  // ---- alias rows ----
  function renderAliases() {
    const host = $("aliasRows");
    host.replaceChildren();

    if (state.aliases.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "还没有映射。中转站模型名和标准名一致时无需添加。";
      host.append(empty);
    }

    state.aliases.forEach((pair, i) => {
      const row = document.createElement("div");
      row.className = "arow";

      const from = document.createElement("input");
      from.className = "field";
      from.value = pair.from;
      from.placeholder = "中转站模型名";
      from.spellcheck = false;
      from.setAttribute("aria-label", "中转站模型名");
      from.addEventListener("input", () => { pair.from = from.value; markDirty(); });

      const arrow = document.createElement("span");
      arrow.className = "arrow-col";
      arrow.append(iconArrow(15));
      arrow.setAttribute("aria-hidden", "true");

      const to = document.createElement("input");
      to.className = "field";
      to.value = pair.to;
      to.placeholder = "标准模型名";
      to.spellcheck = false;
      to.setAttribute("aria-label", "标准模型名");
      to.addEventListener("input", () => { pair.to = to.value; markDirty(); });

      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn icon del-col";
      del.append(iconX(13));
      del.title = "删除";
      del.setAttribute("aria-label", `删除映射 ${pair.from || pair.to}`);
      del.addEventListener("click", () => {
        state.aliases.splice(i, 1);
        renderAliases();
        markDirty();
      });

      row.append(from, arrow, to, del);
      host.append(row);
    });

    $("aliasCount").textContent = state.aliases.length;
  }

  const addAliasBtn = $("addAlias");
  addAliasBtn.replaceChildren(iconPlus(13), document.createTextNode(" 添加映射"));
  addAliasBtn.addEventListener("click", () => {
    state.aliases.push({ from: "", to: "" });
    renderAliases();
    markDirty();
    const rows = $("aliasRows").querySelectorAll(".arow");
    rows[rows.length - 1]?.querySelector("input")?.focus();
  });

  // ---- free tag ----
  const freeTag = $("freeTag");
  freeTag.value = state.freeTag;
  freeTag.addEventListener("input", () => { state.freeTag = freeTag.value; markDirty(); });

  // ---- save ----
  $("save").addEventListener("click", async () => {
    $("error").hidden = true;
    $("ok").hidden = true;

    const aliases = {};
    for (const { from, to } of state.aliases) {
      const k = from.trim(), v = to.trim();
      if (k && v) aliases[k] = v;
    }
    const next = {
      prefixes: state.prefixes.map((s) => s.trim()).filter(Boolean),
      suffixes: state.suffixes.map((s) => s.trim()).filter(Boolean),
      aliases,
      freeTag: state.freeTag.trim() || "free",
    };
    // this page only owns matching rules; keep provider fields as they were
    for (const k of ["id", "name", "api"]) {
      if (opts[k] !== undefined) next[k] = opts[k];
    }

    try {
      await magpie.options.set(next);
      saved = JSON.stringify(state);
      markDirty(false);
      $("ok").hidden = false;
    } catch (e) {
      markDirty(false);
      $("error").hidden = false;
      $("error").textContent = `保存失败：${e.message}`;
    }
  });

  // ---- initial paint ----
  renderChips("prefixes", "prefixChips", "prefixCount", "如 free");
  renderChips("suffixes", "suffixChips", "suffixCount", "如 thinking");
  renderAliases();
  markDirty();
})();
