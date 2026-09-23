/**
 * matcher.js — Intelligent Answer-to-DOM Option Matcher
 * Maps the AI's returned answer (text, option ID, or index) to the correct DOM option.
 * Implements multi-tier matching:
 * 1. Explicit ID / Index match
 * 2. Exact normalized text match
 * 3. Prefix & suffix stripped match
 * 4. Token overlap & substring match
 * 5. String similarity distance
 */

(function () {
  'use strict';

  class OptionMatcher {
    /**
     * Finds the best matching option from the question's available options
     * @param {string} aiAnswer - Raw answer from LLM (e.g. "Representational Verification" or "A" or "o1")
     * @param {Array} availableOptions - List of extracted options for this question
     * @returns {Object|null} The matched option object
     */
    findMatch(aiAnswer, availableOptions) {
      if (!aiAnswer || !availableOptions || availableOptions.length === 0) {
        return null;
      }

      const rawAnswer = String(aiAnswer).trim();
      const normAnswer = this.normalize(rawAnswer);

      // Tier 1: Direct ID Match (e.g. "o1", "o2")
      let match = availableOptions.find(opt => opt.id.toLowerCase() === rawAnswer.toLowerCase());
      if (match) return match;

      // Tier 2: Letter ID Match (e.g. "A" -> index 0, "B" -> index 1)
      if (/^[A-H]$/i.test(rawAnswer)) {
        const letterIndex = rawAnswer.toUpperCase().charCodeAt(0) - 65;
        if (letterIndex >= 0 && letterIndex < availableOptions.length) {
          return availableOptions[letterIndex];
        }
      }

      // Tier 3: Numeric Index Match (e.g. "1" -> index 0)
      if (/^\d+$/.test(rawAnswer)) {
        const numIndex = parseInt(rawAnswer, 10) - 1;
        if (numIndex >= 0 && numIndex < availableOptions.length) {
          return availableOptions[numIndex];
        }
      }

      // Tier 4: Exact Normalized Text Match
      match = availableOptions.find(opt => this.normalize(opt.text) === normAnswer);
      if (match) return match;

      // Tier 5: Stripped Prefix Match (e.g. "A. Option Text" vs "Option Text")
      const strippedAnswer = this.stripOptionPrefix(normAnswer);
      match = availableOptions.find(opt => {
        const strippedOpt = this.stripOptionPrefix(this.normalize(opt.text));
        return strippedOpt === strippedAnswer || strippedOpt.includes(strippedAnswer) || strippedAnswer.includes(strippedOpt);
      });
      if (match) return match;

      // Tier 6: Substring / Inclusion Match
      match = availableOptions.find(opt => {
        const optNorm = this.normalize(opt.text);
        return optNorm.includes(normAnswer) || normAnswer.includes(optNorm);
      });
      if (match) return match;

      // Tier 7: Token Overlap (Jaccard similarity)
      let bestOption = null;
      let highestScore = 0;

      const answerTokens = this.tokenize(normAnswer);

      for (const opt of availableOptions) {
        const optTokens = this.tokenize(this.normalize(opt.text));
        const score = this.calculateTokenOverlap(answerTokens, optTokens);
        if (score > highestScore && score >= 0.5) {
          highestScore = score;
          bestOption = opt;
        }
      }

      return bestOption;
    }

    normalize(str) {
      if (!str) return '';
      return str
        .toLowerCase()
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[^\w\s]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    stripOptionPrefix(str) {
      return str.replace(/^[a-h1-8]\s*[\.\)\:\-]\s*/i, '').trim();
    }

    tokenize(str) {
      return new Set(str.split(/\s+/).filter(w => w.length > 1));
    }

    calculateTokenOverlap(setA, setB) {
      if (setA.size === 0 || setB.size === 0) return 0;
      let intersection = 0;
      for (const item of setA) {
        if (setB.has(item)) intersection++;
      }
      return intersection / Math.max(setA.size, setB.size);
    }
  }

  // Export to global window context
  window.AIOptionMatcher = new OptionMatcher();
})();
