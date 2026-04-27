const fs = require('fs');
const path = require('path');

// Extract getQuad function from index.html
const htmlCode = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
const regex = /function getQuad\s*\([^)]*\)\s*\{[\s\S]*?return 'eliminate';\s*\}/;
const match = htmlCode.match(regex);

if (!match) {
  throw new Error("Could not find getQuad function in index.html");
}

// Evaluate the function into the current scope
let getQuad;
eval("getQuad = " + match[0]);

describe('getQuad', () => {
  describe('Happy path (extreme values)', () => {
    test('High urgency, high importance -> do-first', () => {
      expect(getQuad(5, 5)).toBe('do-first');
    });

    test('Low urgency, high importance -> schedule', () => {
      expect(getQuad(5, 1)).toBe('schedule');
    });

    test('High urgency, low importance -> delegate', () => {
      expect(getQuad(1, 5)).toBe('delegate');
    });

    test('Low urgency, low importance -> eliminate', () => {
      expect(getQuad(1, 1)).toBe('eliminate');
    });
  });

  describe('Boundary values (threshold = 4)', () => {
    test('urgency = 4, importance = 4 -> do-first', () => {
      expect(getQuad(4, 4)).toBe('do-first');
    });

    test('urgency = 3, importance = 4 -> schedule', () => {
      expect(getQuad(4, 3)).toBe('schedule');
    });

    test('urgency = 4, importance = 3 -> delegate', () => {
      expect(getQuad(3, 4)).toBe('delegate');
    });

    test('urgency = 3, importance = 3 -> eliminate', () => {
      expect(getQuad(3, 3)).toBe('eliminate');
    });
  });

  describe('Decimal/floating point values', () => {
    test('urgency = 4.1, importance = 4.1 -> do-first', () => {
      expect(getQuad(4.1, 4.1)).toBe('do-first');
    });

    test('urgency = 3.9, importance = 4.1 -> schedule', () => {
      expect(getQuad(4.1, 3.9)).toBe('schedule');
    });

    test('urgency = 4.1, importance = 3.9 -> delegate', () => {
      expect(getQuad(3.9, 4.1)).toBe('delegate');
    });

    test('urgency = 3.9, importance = 3.9 -> eliminate', () => {
      expect(getQuad(3.9, 3.9)).toBe('eliminate');
    });
  });
});
