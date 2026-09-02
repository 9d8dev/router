(function () {
  "use strict";

  if (window.RouterFormsV1) {
    window.RouterFormsV1.scan();
    return;
  }

  var initialized = new WeakSet();
  var script = document.currentScript;
  var apiBase = script && script.src ? new URL(script.src, window.location.href).origin : "https://forms.router.so";
  var styleId = "router-forms-v1-styles";
  var mountSequence = 0;

  function installStyles() {
    if (document.getElementById(styleId)) return;
    var style = document.createElement("style");
    style.id = styleId;
    style.textContent = [
      ".router-form-v1{--rf-color:var(--router-form-color,currentColor);--rf-muted:var(--router-form-muted-color,color-mix(in srgb,currentColor 62%,transparent));--rf-border:var(--router-form-border-color,color-mix(in srgb,currentColor 22%,transparent));--rf-surface:var(--router-form-surface,transparent);--rf-accent:var(--router-form-accent,currentColor);--rf-accent-contrast:var(--router-form-accent-contrast,Canvas);color:var(--rf-color);font:inherit;line-height:1.5;width:100%}",
      ".router-form-v1,.router-form-v1 *{box-sizing:border-box}",
      ".router-form-v1__header{margin:0 0 1.5rem}",
      ".router-form-v1__title{color:inherit;font:inherit;font-size:clamp(1.5rem,4vw,2.25rem);font-weight:650;letter-spacing:-.025em;line-height:1.15;margin:0}",
      ".router-form-v1__description{color:var(--rf-muted);font:inherit;margin:.6rem 0 0;max-width:60ch}",
      ".router-form-v1__fields{display:grid;gap:1.1rem}",
      ".router-form-v1__field{border:0;display:grid;gap:.42rem;margin:0;min-width:0;padding:0}",
      ".router-form-v1__label,.router-form-v1__legend{color:inherit;font:inherit;font-size:.925rem;font-weight:600;margin:0;padding:0}",
      ".router-form-v1__required{color:var(--rf-muted);font-weight:400;margin-left:.2rem}",
      ".router-form-v1__help{color:var(--rf-muted);font-size:.825rem;margin:0}",
      ".router-form-v1__input,.router-form-v1__select,.router-form-v1__textarea{appearance:none;background:var(--rf-surface);border:1px solid var(--rf-border);border-radius:var(--router-form-radius,.6rem);color:inherit;font:inherit;font-size:1rem;line-height:1.4;min-height:2.75rem;padding:.68rem .78rem;width:100%}",
      ".router-form-v1__textarea{min-height:7rem;resize:vertical}",
      ".router-form-v1__input:focus,.router-form-v1__select:focus,.router-form-v1__textarea:focus{border-color:var(--rf-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--rf-accent) 18%,transparent);outline:none}",
      ".router-form-v1__choices{display:grid;gap:.55rem}",
      ".router-form-v1__choice{align-items:flex-start;cursor:pointer;display:flex;font:inherit;gap:.55rem}",
      ".router-form-v1__choice input{accent-color:var(--rf-accent);height:1.05rem;margin:.22rem 0 0;width:1.05rem}",
      ".router-form-v1__range{accent-color:var(--rf-accent);width:100%}",
      ".router-form-v1__range-value{color:var(--rf-muted);font-size:.825rem}",
      ".router-form-v1__error{color:var(--router-form-error,#b42318);font-size:.825rem;margin:0}",
      ".router-form-v1__invalid{border-color:var(--router-form-error,#b42318)!important}",
      ".router-form-v1__submit{appearance:none;background:var(--rf-accent);border:1px solid var(--rf-accent);border-radius:var(--router-form-radius,.6rem);color:var(--rf-accent-contrast);cursor:pointer;font:inherit;font-weight:650;margin-top:1.35rem;min-height:2.8rem;padding:.7rem 1.05rem}",
      ".router-form-v1__submit:hover{filter:brightness(.94)}",
      ".router-form-v1__submit:focus-visible{box-shadow:0 0 0 3px color-mix(in srgb,var(--rf-accent) 24%,transparent);outline:none}",
      ".router-form-v1__submit[disabled]{cursor:wait;opacity:.62}",
      ".router-form-v1__status{border:1px solid var(--rf-border);border-radius:var(--router-form-radius,.6rem);margin:0;padding:1rem}",
      ".router-form-v1__attribution{color:var(--rf-muted);font-size:.72rem;margin:1rem 0 0}",
      ".router-form-v1__attribution a{color:inherit}",
      ".router-form-v1__honeypot{height:1px!important;left:-10000px!important;overflow:hidden!important;position:absolute!important;width:1px!important}",
      "@media(prefers-reduced-motion:no-preference){.router-form-v1__submit{transition:filter .15s ease,opacity .15s ease}}"
    ].join("");
    document.head.appendChild(style);
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function controlId(publicId, instanceId, fieldId) {
    return "router-form-" + publicId + "-" + instanceId + "-" + fieldId;
  }

  function appendHelp(container, field, id) {
    if (!field.helpText) return null;
    var help = element("p", "router-form-v1__help", field.helpText);
    help.id = id + "-help";
    container.appendChild(help);
    return help.id;
  }

  function setCommon(control, field, id, helpId) {
    control.id = id;
    control.name = field.key;
    if (field.required) control.required = true;
    if (field.placeholder) control.placeholder = field.placeholder;
    if (helpId) control.setAttribute("aria-describedby", helpId);
    control.classList.add("router-form-v1__input");
  }

  function renderField(field, publicId, instanceId) {
    var isGroup = ["radio", "checkbox-group", "yes-no"].indexOf(field.kind) !== -1;
    var wrapper = element(isGroup ? "fieldset" : "div", "router-form-v1__field");
    wrapper.dataset.routerField = field.key;
    var id = controlId(publicId, instanceId, field.id);
    var label = element(isGroup ? "legend" : "label", isGroup ? "router-form-v1__legend" : "router-form-v1__label", field.label);
    if (!isGroup) label.htmlFor = id;
    if (field.required) label.appendChild(element("span", "router-form-v1__required", " (required)"));
    wrapper.appendChild(label);
    var helpId = appendHelp(wrapper, field, id);

    if (field.kind === "textarea") {
      var textarea = document.createElement("textarea");
      setCommon(textarea, field, id, helpId);
      textarea.className = "router-form-v1__textarea";
      textarea.rows = field.rows || 4;
      if (field.defaultValue) textarea.value = field.defaultValue;
      if (field.validation && field.validation.minLength !== undefined) textarea.minLength = field.validation.minLength;
      if (field.validation && field.validation.maxLength !== undefined) textarea.maxLength = field.validation.maxLength;
      wrapper.appendChild(textarea);
    } else if (field.kind === "select") {
      var select = document.createElement("select");
      setCommon(select, field, id, helpId);
      select.className = "router-form-v1__select";
      var placeholder = element("option", "", field.placeholder || "Choose an option");
      placeholder.value = "";
      placeholder.disabled = field.required;
      placeholder.selected = !field.defaultValue;
      select.appendChild(placeholder);
      field.options.forEach(function (option) {
        var optionNode = element("option", "", option.label);
        optionNode.value = option.value;
        optionNode.selected = field.defaultValue === option.value;
        select.appendChild(optionNode);
      });
      wrapper.appendChild(select);
    } else if (field.kind === "radio" || field.kind === "checkbox-group" || field.kind === "yes-no") {
      var choices = element("div", "router-form-v1__choices");
      choices.setAttribute("role", field.kind === "radio" || field.kind === "yes-no" ? "radiogroup" : "group");
      if (helpId) choices.setAttribute("aria-describedby", helpId);
      var options = field.kind === "yes-no"
        ? [{ id: "yes", label: "Yes", value: "true" }, { id: "no", label: "No", value: "false" }]
        : field.options;
      options.forEach(function (option, index) {
        var choiceLabel = element("label", "router-form-v1__choice");
        var input = document.createElement("input");
        input.type = field.kind === "checkbox-group" ? "checkbox" : "radio";
        input.name = field.key;
        input.value = option.value;
        input.id = id + "-" + index;
        if (field.required && field.kind !== "checkbox-group" && index === 0) input.required = true;
        var defaults = Array.isArray(field.defaultValue) ? field.defaultValue : [String(field.defaultValue)];
        input.checked = defaults.indexOf(option.value) !== -1;
        choiceLabel.appendChild(input);
        choiceLabel.appendChild(document.createTextNode(option.label));
        choices.appendChild(choiceLabel);
      });
      if (field.kind === "checkbox-group") {
        var checkboxInputs = choices.querySelectorAll('input[type="checkbox"]');
        var validationAnchor = checkboxInputs[0];
        var minimumSelections = Math.max(field.required ? 1 : 0, field.validation && field.validation.minSelections || 0);
        var maximumSelections = field.validation && field.validation.maxSelections;
        var syncCheckboxGroupValidity = function () {
          var checked = Array.prototype.filter.call(checkboxInputs, function (input) { return input.checked; }).length;
          var message = checked < minimumSelections
            ? "Choose at least " + minimumSelections + " option" + (minimumSelections === 1 ? "." : "s.")
            : maximumSelections !== undefined && checked > maximumSelections
              ? "Choose no more than " + maximumSelections + " option" + (maximumSelections === 1 ? "." : "s.")
              : "";
          if (validationAnchor) validationAnchor.setCustomValidity(message);
        };
        checkboxInputs.forEach(function (input) { input.addEventListener("change", syncCheckboxGroupValidity); });
        syncCheckboxGroupValidity();
      }
      wrapper.appendChild(choices);
    } else if (field.kind === "checkbox" || field.kind === "switch") {
      label.remove();
      var checkLabel = element("label", "router-form-v1__choice");
      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = id;
      checkbox.name = field.key;
      checkbox.required = Boolean(field.required);
      checkbox.checked = Boolean(field.defaultValue);
      checkLabel.appendChild(checkbox);
      checkLabel.appendChild(document.createTextNode(field.label + (field.required ? " (required)" : "")));
      wrapper.insertBefore(checkLabel, wrapper.firstChild);
    } else if (field.kind === "slider") {
      var range = document.createElement("input");
      range.type = "range";
      range.id = id;
      range.name = field.key;
      range.className = "router-form-v1__range";
      range.min = String(field.validation && field.validation.min !== undefined ? field.validation.min : 0);
      range.max = String(field.validation && field.validation.max !== undefined ? field.validation.max : 100);
      range.step = String(field.validation && field.validation.step !== undefined ? field.validation.step : 1);
      range.value = String(field.defaultValue !== undefined ? field.defaultValue : range.min);
      var rangeValue = element("output", "router-form-v1__range-value", range.value);
      rangeValue.htmlFor = id;
      range.addEventListener("input", function () { rangeValue.textContent = range.value; });
      wrapper.appendChild(range);
      wrapper.appendChild(rangeValue);
    } else {
      var input = document.createElement("input");
      var types = { email: "email", phone: "tel", url: "url", date: "date", number: "number" };
      input.type = types[field.kind] || "text";
      setCommon(input, field, id, helpId);
      if (field.defaultValue !== undefined) input.value = String(field.defaultValue);
      if (field.validation) {
        if (field.validation.minLength !== undefined) input.minLength = field.validation.minLength;
        if (field.validation.maxLength !== undefined) input.maxLength = field.validation.maxLength;
        if (field.validation.min !== undefined) input.min = String(field.validation.min);
        if (field.validation.max !== undefined) input.max = String(field.validation.max);
        if (field.validation.step !== undefined) input.step = String(field.validation.step);
      }
      wrapper.appendChild(input);
    }
    return wrapper;
  }

  function valuesFrom(form, definition) {
    var values = {};
    definition.fields.forEach(function (field) {
      var controls = form.elements[field.key];
      if (field.kind === "checkbox-group") {
        var group = controls && controls.length !== undefined ? Array.prototype.slice.call(controls) : [controls];
        values[field.key] = group.filter(function (control) { return control && control.checked; }).map(function (control) { return control.value; });
      } else if (field.kind === "radio" || field.kind === "yes-no") {
        var checked = form.querySelector('[name="' + CSS.escape(field.key) + '"]:checked');
        if (checked) values[field.key] = field.kind === "yes-no" ? checked.value === "true" : checked.value;
      } else if (field.kind === "checkbox" || field.kind === "switch") {
        values[field.key] = Boolean(controls && controls.checked);
      } else if (field.kind === "number" || field.kind === "slider") {
        if (controls && controls.value !== "") values[field.key] = Number(controls.value);
      } else if (controls && controls.value !== "") {
        values[field.key] = controls.value;
      }
    });
    return values;
  }

  function showErrors(form, errors) {
    form.querySelectorAll(".router-form-v1__error").forEach(function (node) { node.remove(); });
    form.querySelectorAll(".router-form-v1__invalid").forEach(function (node) {
      node.classList.remove("router-form-v1__invalid");
      node.removeAttribute("aria-invalid");
    });
    var first = null;
    Object.keys(errors || {}).forEach(function (key) {
      var wrapper = form.querySelector('[data-router-field="' + CSS.escape(key) + '"]');
      if (!wrapper) return;
      var control = wrapper.querySelector("input,select,textarea");
      var error = element("p", "router-form-v1__error", errors[key].join(" "));
      error.id = controlId(form.dataset.publicId, form.dataset.instanceId, key) + "-error";
      error.setAttribute("role", "alert");
      wrapper.appendChild(error);
      if (control) {
        control.classList.add("router-form-v1__invalid");
        control.setAttribute("aria-invalid", "true");
        first = first || control;
      }
    });
    if (first) first.focus();
  }

  function render(target, payload, options) {
    installStyles();
    var definition = payload.definition || payload;
    var publicId = payload.publicId || options.publicId || "preview";
    var instanceId = String(++mountSequence);
    target.replaceChildren();
    var root = element("section", "router-form-v1");
    var header = element("header", "router-form-v1__header");
    header.appendChild(element(options.placement === "hosted" ? "h1" : "h2", "router-form-v1__title", definition.title));
    if (definition.description) header.appendChild(element("p", "router-form-v1__description", definition.description));
    root.appendChild(header);
    var form = element("form", "router-form-v1__form");
    form.dataset.publicId = publicId;
    form.dataset.instanceId = instanceId;
    form.noValidate = false;
    var fields = element("div", "router-form-v1__fields");
    definition.fields.forEach(function (field) { fields.appendChild(renderField(field, publicId, instanceId)); });
    form.appendChild(fields);
    var honeypot = element("div", "router-form-v1__honeypot");
    honeypot.setAttribute("aria-hidden", "true");
    var honeypotLabel = element("label", "", "Leave this field empty");
    var honeypotInput = document.createElement("input");
    honeypotInput.name = "website";
    honeypotInput.tabIndex = -1;
    honeypotInput.autocomplete = "off";
    honeypotLabel.appendChild(honeypotInput);
    honeypot.appendChild(honeypotLabel);
    form.appendChild(honeypot);
    var submit = element("button", "router-form-v1__submit", definition.submitLabel);
    submit.type = "submit";
    form.appendChild(submit);
    root.appendChild(form);
    if (payload.attribution && payload.attribution.visible) {
      var attribution = element("p", "router-form-v1__attribution");
      var link = element("a", "", payload.attribution.label);
      link.href = payload.attribution.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      attribution.appendChild(link);
      root.appendChild(attribution);
    }
    target.appendChild(root);

    if (options.preview) {
      form.addEventListener("submit", function (event) { event.preventDefault(); });
      return;
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;
      submit.disabled = true;
      submit.textContent = "Submitting…";
      try {
        var response = await fetch(apiBase + "/api/public/forms/" + encodeURIComponent(publicId) + "/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ values: valuesFrom(form, definition), submitToken: options.submitToken, website: honeypotInput.value })
        });
        var result = await response.json().catch(function () { return {}; });
        if (!response.ok) {
          if (result.fields) showErrors(form, result.fields);
          else throw new Error(result.error === "monthly_capacity_reached" ? "This form is temporarily paused." : "We couldn’t submit the form. Please try again.");
          return;
        }
        if (result.completion && result.completion.type === "redirect") {
          window.location.assign(result.completion.url);
          return;
        }
        root.replaceChildren(element("p", "router-form-v1__status", result.completion && result.completion.message ? result.completion.message : "Thanks — your response has been received."));
      } catch (error) {
        var status = element("p", "router-form-v1__status", error && error.message ? error.message : "Router is unavailable. Please try again.");
        status.setAttribute("role", "alert");
        form.appendChild(status);
      } finally {
        submit.disabled = false;
        submit.textContent = definition.submitLabel;
      }
    });
  }

  async function mount(target, options) {
    options = options || {};
    if (!options.preview && initialized.has(target)) return;
    initialized.add(target);
    var publicId = options.publicId || target.getAttribute("data-router-form");
    var placement = options.placement || target.getAttribute("data-router-placement") || "embed";
    try {
      if (options.definition) {
        render(target, options.definition, { preview: true, publicId: publicId, placement: options.placement || "embed" });
        return;
      }
      target.setAttribute("aria-busy", "true");
      var responses = await Promise.all([
        fetch(apiBase + "/api/public/forms/" + encodeURIComponent(publicId)),
        fetch(apiBase + "/api/public/forms/" + encodeURIComponent(publicId) + "/render-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placement: placement })
        })
      ]);
      if (!responses[0].ok || !responses[1].ok) throw new Error("This form is unavailable.");
      var payload = await responses[0].json();
      var session = await responses[1].json();
      render(target, payload, { publicId: publicId, placement: placement, submitToken: session.submitToken });
    } catch (error) {
      target.replaceChildren(element("p", "router-form-v1 router-form-v1__status", error && error.message ? error.message : "This form is unavailable."));
    } finally {
      target.removeAttribute("aria-busy");
    }
  }

  function scan(root) {
    var scope = root || document;
    scope.querySelectorAll("[data-router-form]").forEach(function (target) { mount(target); });
  }

  window.RouterFormsV1 = { mount: mount, render: render, scan: scan };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { scan(); });
  else scan();
  new MutationObserver(function (records) {
    records.forEach(function (record) {
      record.addedNodes.forEach(function (node) {
        if (node.nodeType === 1) {
          if (node.matches && node.matches("[data-router-form]")) mount(node);
          scan(node);
        }
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
