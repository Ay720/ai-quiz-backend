/**
 * extractor.js — Universal Quiz Question Extraction Engine
 * Works across Google Forms, Microsoft Forms, Canvas, Blackboard, Moodle,
 * and any college or practice quiz portal.
 */

(function () {
  'use strict';

  class GenericQuestionExtractor {
    extractAllQuestions() {
      console.log('[Extractor] === Starting DOM Scan ===');
      console.log(`[Extractor] Location: ${window.location.href}`);

      const results = [];

      // 1. Diagnostic: Count potential elements
      const roleRadios = Array.from(document.querySelectorAll('[role="radio"]'));
      const inputRadios = Array.from(document.querySelectorAll('input[type="radio"]'));
      const roleCheckboxes = Array.from(document.querySelectorAll('[role="checkbox"]'));
      const inputCheckboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
      const radiogroups = Array.from(document.querySelectorAll('[role="radiogroup"]'));

      console.log(`[Extractor] DOM Counts: role="radio"=${roleRadios.length}, input[radio]=${inputRadios.length}, role="checkbox"=${roleCheckboxes.length}, input[checkbox]=${inputCheckboxes.length}, role="radiogroup"=${radiogroups.length}`);

      // Strategy A: Google Forms & ARIA Radiogroups
      if (radiogroups.length > 0 || roleRadios.length > 0) {
        const ariaQuestions = this.extractFromAria(radiogroups, roleRadios, roleCheckboxes);
        if (ariaQuestions.length > 0) {
          console.log(`[Extractor] Successfully extracted ${ariaQuestions.length} ARIA/Google Forms questions.`);
          return ariaQuestions;
        }
      }

      // Strategy B: Standard HTML Inputs (<input type="radio"> & <input type="checkbox">)
      if (inputRadios.length > 0 || inputCheckboxes.length > 0) {
        const inputQuestions = this.extractFromHtmlInputs(inputRadios, inputCheckboxes);
        if (inputQuestions.length > 0) {
          console.log(`[Extractor] Successfully extracted ${inputQuestions.length} HTML Input questions.`);
          return inputQuestions;
        }
      }

      // Strategy C: Structural Container-based Extraction (Listitems, Cards, Fieldsets)
      const containerQuestions = this.extractFromContainers();
      if (containerQuestions.length > 0) {
        console.log(`[Extractor] Successfully extracted ${containerQuestions.length} container-based questions.`);
        return containerQuestions;
      }

      // Strategy D: Universal Text-Block Fallback
      const universalQuestions = this.extractUniversalFallback();
      console.log(`[Extractor] Universal fallback extracted ${universalQuestions.length} questions.`);
      return universalQuestions;
    }

    /**
     * Strategy A: ARIA Radiogroups and [role="radio"] (Google Forms, modern web apps)
     */
    extractFromAria(radiogroups, roleRadios, roleCheckboxes) {
      const questions = [];

      // If we have explicit radiogroups
      if (radiogroups.length > 0) {
        radiogroups.forEach((rg, idx) => {
          const card = this.findQuestionCardAncestor(rg);
          const radioItems = Array.from(rg.querySelectorAll('[role="radio"], [role="checkbox"]'));
          const options = this.extractAriaOptions(radioItems.length > 0 ? radioItems : Array.from(rg.children));

          if (options.length >= 2) {
            const prompt = this.extractPromptAbove(card, rg, options[0].text);
            if (prompt) {
              questions.push({
                id: `q${questions.length + 1}`,
                question: prompt,
                options: options,
                container: card
              });
            }
          }
        });
      }

      // If radiogroups didn't capture all or weren't used, cluster role="radio" by card
      if (questions.length === 0 && roleRadios.length > 0) {
        const clustered = this.clusterElementsByCard(roleRadios);
        for (const card of clustered.keys()) {
          const radios = clustered.get(card);
          if (radios.length >= 2) {
            const options = this.extractAriaOptions(radios);
            const prompt = this.extractPromptAbove(card, radios[0], options[0].text);
            if (prompt) {
              questions.push({
                id: `q${questions.length + 1}`,
                question: prompt,
                options: options,
                container: card
              });
            }
          }
        }
      }

      return questions;
    }

    /**
     * Strategy B: HTML Inputs (<input type="radio">)
     */
    extractFromHtmlInputs(inputRadios, inputCheckboxes) {
      const questions = [];
      const allInputs = [...inputRadios, ...inputCheckboxes];

      // Group by 'name' attribute first
      const nameGroups = new Map();
      allInputs.forEach(inp => {
        const name = inp.getAttribute('name') || 'unnamed_' + Math.random().toString(36).substring(7);
        if (!nameGroups.has(name)) nameGroups.set(name, []);
        nameGroups.get(name).push(inp);
      });

      for (const [name, inputs] of nameGroups.entries()) {
        if (inputs.length >= 2) {
          const card = this.findQuestionCardAncestor(inputs[0]);
          const options = inputs.map((inp, idx) => {
            let labelText = '';
            if (inp.id) {
              const l = document.querySelector(`label[for="${CSS.escape(inp.id)}"]`);
              if (l) labelText = this.getCleanText(l);
            }
            if (!labelText) {
              const parentLabel = inp.closest('label');
              if (parentLabel) labelText = this.getCleanText(parentLabel);
            }
            if (!labelText && inp.parentElement) {
              labelText = this.getCleanText(inp.parentElement);
            }

            return {
              id: `o${idx + 1}`,
              text: this.cleanOptionText(labelText) || `Option ${idx + 1}`,
              element: inp,
              clickableElement: inp.closest('label') || inp
            };
          });

          const prompt = this.extractPromptAbove(card, inputs[0], options[0].text);
          if (prompt) {
            questions.push({
              id: `q${questions.length + 1}`,
              question: prompt,
              options: options,
              container: card
            });
          }
        }
      }

      return questions;
    }

    /**
     * Strategy C: Structural Container-based Extraction
     */
    extractFromContainers() {
      const questions = [];
      const cards = document.querySelectorAll(
        '[role="listitem"], .Qr7Oae, .geSAlb, .office-form-question, .question_holder, .quiz_question, .que, fieldset, [data-item-id]'
      );

      cards.forEach(card => {
        const optionEls = Array.from(card.querySelectorAll('[role="radio"], [role="checkbox"], input[type="radio"], input[type="checkbox"]'));
        if (optionEls.length >= 2) {
          const options = optionEls.map((el, idx) => {
            const text = el.getAttribute('aria-label') || el.getAttribute('data-value') || this.getCleanText(el.closest('label, div') || el);
            return {
              id: `o${idx + 1}`,
              text: this.cleanOptionText(text) || `Option ${idx + 1}`,
              element: el,
              clickableElement: el.closest('label, [role="presentation"], .docssharedWizToggleLabeledContainer') || el
            };
          });

          const prompt = this.extractPromptAbove(card, optionEls[0], options[0].text);
          if (prompt) {
            questions.push({
              id: `q${questions.length + 1}`,
              question: prompt,
              options: options,
              container: card
            });
          }
        }
      });

      return questions;
    }

    /**
     * Strategy D: Universal Fallback
     */
    extractUniversalFallback() {
      const questions = [];
      // Search for any blocks with question mark or numbered prefixes followed by option-like items
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, [role="heading"], strong, b'));
      headings.forEach(h => {
        const text = this.getCleanText(h);
        if (text.length > 8 && (text.includes('?') || /^\d+[\.\)]\s+/.test(text))) {
          const container = h.closest('div, section, article, li') || h.parentElement;
          if (container) {
            const candidateOptions = Array.from(container.querySelectorAll('[role="radio"], input, label, li'))
              .filter(el => el !== h && !h.contains(el));
            if (candidateOptions.length >= 2) {
              const options = candidateOptions.slice(0, 6).map((el, idx) => ({
                id: `o${idx + 1}`,
                text: this.cleanOptionText(this.getCleanText(el)) || `Option ${idx + 1}`,
                element: el,
                clickableElement: el
              }));

              questions.push({
                id: `q${questions.length + 1}`,
                question: this.cleanQuestionText(text),
                options: options,
                container: container
              });
            }
          }
        }
      });

      return questions;
    }

    /**
     * Extracts option objects from ARIA radio elements
     */
    extractAriaOptions(elements) {
      const options = [];

      elements.forEach((el, idx) => {
        let text = el.getAttribute('aria-label') || '';
        if (!text) text = el.getAttribute('data-value') || '';
        if (!text) {
          const wrapper = el.closest('.docssharedWizToggleLabeledContainer, .nWQGrd, .SGdaAf, label') || el;
          text = this.getCleanText(wrapper);
        }
        if (!text && el.parentElement) {
          text = this.getCleanText(el.parentElement);
        }

        text = this.cleanOptionText(text);

        if (text) {
          options.push({
            id: `o${idx + 1}`,
            text: text,
            element: el,
            clickableElement: el.closest('.docssharedWizToggleLabeledContainer, .nWQGrd, label') || el
          });
        }
      });

      return options;
    }

    /**
     * Crucial: Extracts the question prompt text that appears ABOVE the options.
     * Guaranteed to work regardless of classes or tag types.
     */
    extractPromptAbove(card, firstOptionElement, firstOptionText) {
      if (!card) return '';

      // 1. Check for standard question title elements inside card
      const titleSelectors = [
        '[role="heading"]',
        '.M7eMe',
        '.HoDLnd',
        '.F9NWFb',
        '.question-title',
        '.question-text',
        '[data-automation-id="questionTitle"]',
        'legend',
        'h1, h2, h3, h4, h5'
      ];

      for (const sel of titleSelectors) {
        const el = card.querySelector(sel);
        if (el) {
          const text = this.cleanQuestionText(this.getCleanText(el));
          if (text.length > 5 && !/^\d+\s*points?$/i.test(text)) {
            return text;
          }
        }
      }

      // 2. Universal Text Split: Everything in card.innerText before the first option text
      const cardFullText = this.getCleanText(card);
      if (firstOptionText && cardFullText.includes(firstOptionText)) {
        const idx = cardFullText.indexOf(firstOptionText);
        let beforeText = cardFullText.substring(0, idx).trim();
        beforeText = this.cleanQuestionText(beforeText);
        if (beforeText.length > 5) {
          return beforeText;
        }
      }

      // 3. Collect text nodes appearing before the first option element
      const allDescendants = Array.from(card.querySelectorAll('*'));
      let gathered = '';
      for (const el of allDescendants) {
        if (el === firstOptionElement || firstOptionElement.contains(el)) break;
        if (el.children.length === 0) {
          const t = this.getCleanText(el);
          if (t && !gathered.includes(t)) {
            gathered += ' ' + t;
          }
        }
      }

      gathered = this.cleanQuestionText(gathered);
      if (gathered.length > 5) {
        return gathered;
      }

      return '';
    }

    /**
     * Clusters elements by their closest question card ancestor
     */
    clusterElementsByCard(elements) {
      const map = new Map();
      elements.forEach(el => {
        const card = this.findQuestionCardAncestor(el);
        if (!map.has(card)) map.set(card, []);
        map.get(card).push(el);
      });
      return map;
    }

    findQuestionCardAncestor(el) {
      let current = el.parentElement;
      while (current && current !== document.body) {
        if (
          current.getAttribute('role') === 'listitem' ||
          current.classList.contains('Qr7Oae') ||
          current.classList.contains('geSAlb') ||
          current.hasAttribute('data-item-id') ||
          current.classList.contains('office-form-question') ||
          current.classList.contains('question_holder') ||
          current.classList.contains('quiz_question') ||
          current.classList.contains('que') ||
          current.tagName.toLowerCase() === 'fieldset'
        ) {
          return current;
        }
        current = current.parentElement;
      }

      // Fallback: Grandparent
      return el.parentElement?.parentElement || el.parentElement || document.body;
    }

    cleanQuestionText(text) {
      if (!text) return '';
      return text
        .replace(/\s*\*+\s*$/, '') // remove trailing required asterisks
        .replace(/\b\d+\s*points?\b/gi, '') // remove points indicator e.g. "1 point"
        .replace(/^\d+[\.\)]\s*/, '') // remove leading numbering if desired
        .replace(/\s+/g, ' ')
        .trim();
    }

    cleanOptionText(text) {
      if (!text) return '';
      return text.replace(/\s+/g, ' ').trim();
    }

    getCleanText(el) {
      if (!el) return '';
      const text = el.innerText || el.textContent || '';
      return text.replace(/\s+/g, ' ').trim();
    }
  }

  // Export to global window context
  window.AIGenericExtractor = new GenericQuestionExtractor();
})();
