/**
 * extractor.js — Universal Quiz Question Extraction Engine
 * Supports:
 * 1. Multiple-choice questions (Google Forms, MS Forms, Canvas, Moodle, HTML inputs)
 * 2. Written/Text questions (Short answers, Paragraphs, Textareas, Contenteditable)
 * 3. Image-based questions (Diagrams, Math formulas, Option graphics, Question photos)
 * Strictly skips student metadata fields (Name, Email, Roll Number).
 */

(function () {
  'use strict';

  class GenericQuestionExtractor {
    extractAllQuestions() {
      console.log('[Extractor] === Starting Universal DOM Scan ===');
      console.log(`[Extractor] Location: ${window.location.href}`);

      let questions = [];

      // Strategy 1: Container-Based Scan (Most reliable for Google Forms, MS Forms, Canvas, Moodle)
      const containerQuestions = this.extractFromContainers();
      if (containerQuestions.length > 0) {
        console.log(`[Extractor] Container strategy extracted ${containerQuestions.length} questions.`);
        questions = containerQuestions;
      } else {
        // Strategy 2: Grouped Inputs & Radios Fallback
        const choiceQuestions = this.extractChoiceQuestions();
        const textQuestions = this.extractTextQuestions();
        questions = [...choiceQuestions, ...textQuestions];
        console.log(`[Extractor] Combined strategy extracted ${questions.length} questions (${choiceQuestions.length} choice, ${textQuestions.length} text).`);
      }

      // Sort questions according to visual DOM order on the page
      questions.sort((a, b) => {
        if (!a.container || !b.container) return 0;
        if (a.container === b.container) return 0;
        const pos = a.container.compareDocumentPosition(b.container);
        return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
      });

      // Assign sequential human-readable IDs
      questions.forEach((q, idx) => {
        q.id = `q${idx + 1}`;
      });

      console.log(`[Extractor] Total questions ready: ${questions.length}`);
      return questions;
    }

    /**
     * Strategy 1: Extract questions by inspecting top-level question cards
     */
    extractFromContainers() {
      const questions = [];
      const cardSelectors = [
        '[role="listitem"]',
        '.Qr7Oae',
        '.geSAlb',
        '.office-form-question',
        '.question_holder',
        '.quiz_question',
        '.que',
        'fieldset'
      ];

      const cards = Array.from(document.querySelectorAll(cardSelectors.join(', ')));

      cards.forEach((card) => {
        // 1. Check for Multiple Choice / Radiogroup / Checkbox options inside card
        const radioItems = Array.from(card.querySelectorAll('[role="radio"], [role="checkbox"]'));
        const inputRadios = Array.from(card.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
        const optionEls = radioItems.length > 0 ? radioItems : inputRadios;

        // Extract any images attached to this question card
        const cardImages = this.extractImagesFromContainer(card);

        if (optionEls.length >= 2) {
          // MULTIPLE CHOICE QUESTION
          const options = this.extractAriaOptions(optionEls);
          if (options.length >= 2) {
            const prompt = this.extractPromptAbove(card, optionEls[0], options[0].text);
            if (prompt || cardImages.length > 0) {
              questions.push({
                type: 'choice',
                question: prompt || 'Identify the correct option based on the question/image.',
                options: options,
                images: cardImages,
                container: card
              });
              return;
            }
          }
        }

        // 2. Check for Text Input / Written Answer inside card
        const textInput = card.querySelector('input.whsOnd[type="text"], input[type="text"]:not([type="hidden"]), textarea.KHxj8b, textarea, [contenteditable="true"]');
        if (textInput && !this.isSubmitElement(textInput)) {
          const prompt = this.extractPromptForTextInput(card, textInput);
          // Safety: Skip student identity fields (Name, Email, Roll Number)
          if (prompt && !this.isIdentityField(prompt, textInput)) {
            questions.push({
              type: 'text',
              inputType: textInput.tagName.toLowerCase() === 'textarea' ? 'textarea' : 'text',
              question: prompt,
              options: [],
              images: cardImages,
              inputElement: textInput,
              container: card
            });
          }
        }
      });

      return questions;
    }

    /**
     * Fallback: Extract Choice Questions if cards were not explicitly marked
     */
    extractChoiceQuestions() {
      const questions = [];
      const radiogroups = Array.from(document.querySelectorAll('[role="radiogroup"]'));

      if (radiogroups.length > 0) {
        radiogroups.forEach((rg) => {
          const card = this.findQuestionCardAncestor(rg);
          const radioItems = Array.from(rg.querySelectorAll('[role="radio"], [role="checkbox"]'));
          const options = this.extractAriaOptions(radioItems.length > 0 ? radioItems : Array.from(rg.children));

          if (options.length >= 2) {
            const cardImages = this.extractImagesFromContainer(card);
            const prompt = this.extractPromptAbove(card, rg, options[0].text);
            if (prompt || cardImages.length > 0) {
              questions.push({
                type: 'choice',
                question: prompt || 'Select the correct answer.',
                options: options,
                images: cardImages,
                container: card
              });
            }
          }
        });
      }

      return questions;
    }

    /**
     * Fallback: Extract Text Input Questions across document
     */
    extractTextQuestions() {
      const questions = [];
      const inputs = Array.from(document.querySelectorAll('input.whsOnd[type="text"], textarea.KHxj8b, textarea, input[type="text"]:not([type="hidden"])'));

      inputs.forEach((inp) => {
        if (this.isSubmitElement(inp)) return;
        const card = this.findQuestionCardAncestor(inp);

        // Ensure this card doesn't also have radio choices
        const hasRadios = card.querySelector('[role="radio"], input[type="radio"]');
        if (hasRadios) return;

        const prompt = this.extractPromptForTextInput(card, inp);
        if (prompt && !this.isIdentityField(prompt, inp)) {
          const cardImages = this.extractImagesFromContainer(card);
          questions.push({
            type: 'text',
            inputType: inp.tagName.toLowerCase() === 'textarea' ? 'textarea' : 'text',
            question: prompt,
            options: [],
            images: cardImages,
            inputElement: inp,
            container: card
          });
        }
      });

      return questions;
    }

    /**
     * Extracts images embedded within a question card (diagrams, math charts, photos)
     */
    extractImagesFromContainer(container) {
      if (!container) return [];
      const imgs = Array.from(container.querySelectorAll('img'));
      const results = [];

      for (const img of imgs) {
        const width = img.naturalWidth || img.clientWidth || img.width || 0;
        const height = img.naturalHeight || img.clientHeight || img.height || 0;
        const src = img.currentSrc || img.src || '';

        // Ignore tiny decorative icons, transparent spacers, SVGs
        if (!src || src.includes('data:image/svg+xml') || src.includes('cleardot.gif')) continue;
        if (width > 0 && width < 28 && height > 0 && height < 28) continue;
        if (img.classList.contains('quantumWizIcon') || img.classList.contains('google-material-icons')) continue;

        // Try to obtain base64 representation
        let base64 = null;
        if (src.startsWith('data:image/')) {
          base64 = src;
        } else {
          base64 = this.extractImageBase64(img);
        }

        results.push({
          url: src,
          data: base64,
          alt: img.alt || img.getAttribute('aria-label') || 'Question illustration/diagram',
          width: width,
          height: height
        });
      }

      return results;
    }

    /**
     * Converts an image element to a base64 Data URL using HTML5 Canvas
     */
    extractImageBase64(imgEl) {
      try {
        const canvas = document.createElement('canvas');
        const maxDim = 800; // Optimal size for high vision accuracy & low payload
        let w = imgEl.naturalWidth || imgEl.width || 300;
        let h = imgEl.naturalHeight || imgEl.height || 200;
        if (w < 10 || h < 10) return null;

        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgEl, 0, 0, w, h);
        return canvas.toDataURL('image/jpeg', 0.85);
      } catch (e) {
        // In case canvas is tainted due to CORS, background worker will fetch src
        return null;
      }
    }

    /**
     * Checks if a field is a student identity metadata field (Name, Email, Roll No)
     */
    isIdentityField(promptText, el) {
      const lower = (promptText || '').toLowerCase();
      const name = (el?.getAttribute('name') || '').toLowerCase();
      const placeholder = (el?.getAttribute('placeholder') || '').toLowerCase();
      const ariaLabel = (el?.getAttribute('aria-label') || '').toLowerCase();
      const combined = `${lower} ${name} ${placeholder} ${ariaLabel}`;

      const identityKeywords = [
        'your name', 'student name', 'full name', 'enter name', 'candidate name',
        'email address', 'your email', 'enter email',
        'roll number', 'roll no', 'registration no', 'reg no', 'student id', 'enrollment no',
        'phone number', 'mobile number', 'contact number',
        'signature', 'section', 'branch', 'semester'
      ];

      return identityKeywords.some(kw => combined.includes(kw));
    }

    /**
     * Extracts option objects from ARIA radio/checkbox elements
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

        // Check if option itself contains an image (e.g., in visual quizzes)
        const optionImg = el.closest('.docssharedWizToggleLabeledContainer, label')?.querySelector('img');
        const imgUrl = optionImg?.src;

        if (text || imgUrl) {
          options.push({
            id: `o${idx + 1}`,
            text: text || (optionImg?.alt ? `Option [Image: ${optionImg.alt}]` : `Option ${idx + 1}`),
            imageUrl: imgUrl || null,
            element: el,
            clickableElement: el.closest('.docssharedWizToggleLabeledContainer, .nWQGrd, label') || el
          });
        }
      });

      return options;
    }

    /**
     * Extracts prompt text above multiple choice options
     */
    extractPromptAbove(card, firstOptionElement, firstOptionText) {
      if (!card) return '';

      // 1. Standard question title selectors
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
          if (text.length > 3 && !/^\d+\s*points?$/i.test(text)) {
            return text;
          }
        }
      }

      // 2. Text split before first option
      const cardFullText = this.getCleanText(card);
      if (firstOptionText && cardFullText.includes(firstOptionText)) {
        const idx = cardFullText.indexOf(firstOptionText);
        let beforeText = cardFullText.substring(0, idx).trim();
        beforeText = this.cleanQuestionText(beforeText);
        if (beforeText.length > 3) {
          return beforeText;
        }
      }

      // 3. Fallback: text nodes before first option
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
      return gathered.length > 3 ? gathered : '';
    }

    /**
     * Extracts prompt text specifically for text/written input questions
     */
    extractPromptForTextInput(card, inputEl) {
      if (!card) return '';

      // 1. Standard title element in card
      const heading = card.querySelector('[role="heading"], .M7eMe, .HoDLnd, .question-title, legend, h2, h3, h4');
      if (heading) {
        const text = this.cleanQuestionText(this.getCleanText(heading));
        if (text.length > 3) return text;
      }

      // 2. Label associated with input
      if (inputEl.id) {
        const label = document.querySelector(`label[for="${CSS.escape(inputEl.id)}"]`);
        if (label) {
          const text = this.cleanQuestionText(this.getCleanText(label));
          if (text.length > 3) return text;
        }
      }

      // 3. Input aria-label or placeholder
      const aria = inputEl.getAttribute('aria-label');
      if (aria && aria.length > 3 && !aria.includes('Your answer')) {
        return this.cleanQuestionText(aria);
      }

      // 4. Card innerText excluding input value
      const cardText = this.getCleanText(card);
      const cleaned = this.cleanQuestionText(cardText);
      return cleaned.length > 3 ? cleaned : '';
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

      return el.parentElement?.parentElement || el.parentElement || document.body;
    }

    isSubmitElement(el) {
      if (!el) return false;
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (type === 'submit') return true;
      const text = (el.innerText || el.value || '').toLowerCase();
      if (/submit|turn in|finish attempt|hand in/i.test(text)) return true;
      return false;
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
