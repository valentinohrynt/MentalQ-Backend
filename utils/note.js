const normalizeOptionalText = (value) =>
    typeof value === "string" ? value.trim() : "";

const normalizeNoteInput = ({ title, content, emotion } = {}) => ({
    title: normalizeOptionalText(title),
    content: normalizeOptionalText(content),
    emotion: normalizeOptionalText(emotion),
});

const hasUsableNoteContent = (note) =>
    normalizeOptionalText(note?.content).length > 0;

const serializeNoteWithAnalysis = (note, analysis) => {
    const noteData = typeof note?.toJSON === "function" ? note.toJSON() : { ...note };
    delete noteData.analysis;

    return {
        ...noteData,
        predicted_status: analysis?.predicted_status ?? null,
        confidence_score: analysis?.confidence_score ?? null,
    };
};

module.exports = {
    hasUsableNoteContent,
    normalizeNoteInput,
    serializeNoteWithAnalysis,
};
