"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeMessage = sanitizeMessage;
exports.sanitizeSenderName = sanitizeSenderName;
exports.cleanText = cleanText;
exports.sanitizeOutboundText = sanitizeOutboundText;
exports.sanitizeFileName = sanitizeFileName;
const sanitize_html_1 = __importDefault(require("sanitize-html"));
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
function sanitizeMessage(value, maxLength = 1000) {
    return (0, sanitize_html_1.default)(String(value ?? ''), {
        allowedTags: [],
        allowedAttributes: {},
        disallowedTagsMode: 'discard',
        exclusiveFilter: () => true,
    })
        .replace(CONTROL_CHARS, '')
        .replace(/\s+\n/g, '\n')
        .trim()
        .slice(0, maxLength);
}
function sanitizeSenderName(value, maxLength = 80) {
    const name = (0, sanitize_html_1.default)(String(value ?? ''), {
        allowedTags: [],
        allowedAttributes: {},
        disallowedTagsMode: 'discard',
        exclusiveFilter: () => true,
    })
        .replace(/[<>`"'\\]/g, '')
        .replace(CONTROL_CHARS, '')
        .trim()
        .slice(0, maxLength);
    return name || 'Usuario';
}
function cleanText(value, maxLength = 4096) {
    if (typeof value !== 'string')
        return '';
    return (0, sanitize_html_1.default)(value, {
        allowedTags: [],
        allowedAttributes: {},
        disallowedTagsMode: 'discard',
        exclusiveFilter: () => true,
    })
        .replace(CONTROL_CHARS, ' ')
        .replace(/\r\n/g, '\n')
        .replace(/\n{4,}/g, '\n\n\n')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}
function sanitizeOutboundText(value, maxLength) {
    if (typeof value !== 'string')
        return '';
    return cleanText(value, maxLength);
}
function sanitizeFileName(value, mimeType = '') {
    const fallback = `archivo${mimeType ? '.' + mimeType.split('/')[1] : ''}`;
    const raw = typeof value === 'string' ? value : fallback;
    return (raw
        .split(/[\\/]/)
        .pop()
        ?.replace(/[\u0000-\u001F\u007F<>:"|?*]/g, '-')
        .trim() || fallback);
}
//# sourceMappingURL=sanitize.helper.js.map