'use strict';

const UPSTREAM_DIAGNOSTIC_MAX_LENGTH = 500;

function sanitizeUpstreamDiagnostic(value, maxLength = UPSTREAM_DIAGNOSTIC_MAX_LENGTH) {
  if (typeof value !== 'string' || value.length === 0) {
    return '';
  }

  if (!Number.isSafeInteger(maxLength) || maxLength < 4) {
    throw new Error('upstream diagnostic maxLength must be a safe integer >= 4');
  }

  const visible = value
    .replace(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g, (character) => {
      if (character === '\n') return '\\n';
      if (character === '\r') return '\\r';
      if (character === '\t') return '\\t';
      if (character === '\u2028') return '\\u2028';
      if (character === '\u2029') return '\\u2029';
      if (character.charCodeAt(0) > 0x7f) {
        return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
      }

      return `\\x${character.charCodeAt(0).toString(16).padStart(2, '0')}`;
    })
    .trim();

  if (visible.length <= maxLength) {
    return visible;
  }

  return `${visible.slice(0, maxLength - 3)}...`;
}

function getUpstreamDiagnosticMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return '';
}

function formatUpstreamProbeFailure(prefix, error) {
  const message = sanitizeUpstreamDiagnostic(getUpstreamDiagnosticMessage(error));
  return `${prefix}${message ? `: ${message}` : ''}\n`;
}

module.exports = {
  UPSTREAM_DIAGNOSTIC_MAX_LENGTH,
  formatUpstreamProbeFailure,
  getUpstreamDiagnosticMessage,
  sanitizeUpstreamDiagnostic,
};
