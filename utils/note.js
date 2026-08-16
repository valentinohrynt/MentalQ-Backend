const normalizeOptionalText = (value) =>
    typeof value === "string" ? value.trim() : "";

const normalizeNoteInput = ({ title, content, emotion } = {}) => ({
    title: normalizeOptionalText(title),
    content: normalizeOptionalText(content),
    emotion: normalizeOptionalText(emotion),
});

const hasUsableNoteContent = (note) =>
    normalizeOptionalText(note?.content).length > 0;

module.exports = {
    hasUsableNoteContent,
    normalizeNoteInput,
};
