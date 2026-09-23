/**
 * selector.js — Safe Option Selector & DOM Interactor
 * Clicks and triggers radio/checkbox/custom option elements on Google Forms,
 * MS Forms, and web portals.
 * STRICT SAFETY RULE: NEVER clicks Submit buttons or submits the form.
 */

(function () {
  'use strict';

  class OptionSelector {
    /**
     * Safely selects the given option element on the live webpage
     * @param {Object} option - Option object containing element or clickableElement
     * @returns {Object} { success: boolean, error?: string }
     */
    select(option) {
      if (!option) {
        return { success: false, error: 'Option object is null or undefined.' };
      }

      const radioOrInput = option.element;
      const target = option.clickableElement || option.element;
      if (!target) {
        return { success: false, error: 'Target DOM element not found.' };
      }

      // Safety Rule: Check if target looks like a submit button
      if (this.isSubmitElement(target)) {
        console.warn('[Selector] Refused to click target because it looks like a form submit button!');
        return { success: false, error: 'Prevented action: Element is a submit button.' };
      }

      try {
        // 1. Scroll gently into view
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // 2. Dispatch events on multiple candidate targets (inner radio, label wrapper, row container)
        const candidates = new Set([
          radioOrInput,
          target,
          radioOrInput?.parentElement,
          radioOrInput?.closest('.docssharedWizToggleLabeledContainer'),
          radioOrInput?.closest('.nWQGrd'),
          radioOrInput?.closest('label'),
          target?.parentElement
        ]);

        candidates.forEach(cand => {
          if (cand && typeof cand.click === 'function') {
            this.triggerEvents(cand);
          }
        });

        // 3. For Google Forms [role="radio"]:
        if (radioOrInput && radioOrInput.getAttribute('role') === 'radio') {
          radioOrInput.setAttribute('aria-checked', 'true');
        }

        // 4. For standard HTML <input type="radio"> or checkbox
        const input = target.tagName === 'INPUT' ? target : target.querySelector('input');
        if (input && (input.type === 'radio' || input.type === 'checkbox')) {
          if (!input.checked) {
            input.checked = true;
          }
          input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        }

        // 5. Visual confirmation highlight (vibrant emerald green)
        this.highlightOption(target);

        return { success: true };
      } catch (err) {
        return { success: false, error: `Selection failed: ${err.message}` };
      }
    }

    triggerEvents(el) {
      if (!el) return;

      try {
        if (typeof el.focus === 'function') el.focus();
      } catch (e) {}

      // Pointer events
      try {
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      } catch (e) {
        // Fallback for older browsers
        this.fireMouseEvent(el, 'mousedown');
        this.fireMouseEvent(el, 'mouseup');
      }

      // Primary click
      if (typeof el.click === 'function') {
        el.click();
      } else {
        this.fireMouseEvent(el, 'click');
      }
    }

    /**
     * Visual confirmation styling
     */
    highlightOption(el) {
      const container = el.closest(
        '[role="radio"], [role="checkbox"], label, .docssharedWizToggleLabeledContainer, .office-form-question-choice, .geSAlb'
      ) || el;

      container.style.transition = 'all 0.3s ease';
      container.style.boxShadow = '0 0 0 2px #10b981, 0 0 12px rgba(16, 185, 129, 0.4)';
      container.style.borderRadius = '6px';
    }

    /**
     * Hard safeguard: Ensures we NEVER click a submit button
     */
    isSubmitElement(el) {
      if (!el) return false;
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (type === 'submit') return true;

      const text = (el.innerText || el.textContent || el.value || '').trim().toLowerCase();
      const forbiddenPhrases = [
        'submit',
        'submit quiz',
        'submit exam',
        'turn in',
        'finish quiz',
        'finish exam',
        'hand in',
        'complete assessment'
      ];

      return forbiddenPhrases.some(phrase => text === phrase || text.startsWith(phrase));
    }

    fireMouseEvent(element, eventType) {
      const evt = new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: window
      });
      element.dispatchEvent(evt);
    }
  }

  // Export to global window context
  window.AIOptionSelector = new OptionSelector();
})();
