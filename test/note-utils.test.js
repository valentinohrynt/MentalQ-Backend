const test = require("node:test");
const assert = require("node:assert/strict");
const {
    hasUsableNoteContent,
    normalizeNoteInput,
    serializeNoteWithAnalysis,
} = require("../utils/note");

test("normalizeNoteInput trims journal fields", () => {
    assert.deepEqual(
        normalizeNoteInput({
            title: "  Today  ",
            content: "  I feel better.  ",
            emotion: "  Happy  ",
        }),
        {
            title: "Today",
            content: "I feel better.",
            emotion: "Happy",
        }
    );
});

test("normalizeNoteInput safely handles missing and non-string fields", () => {
    assert.deepEqual(normalizeNoteInput({ content: null, title: 123 }), {
        title: "",
        content: "",
        emotion: "",
    });
});

test("hasUsableNoteContent rejects empty legacy drafts", () => {
    assert.equal(hasUsableNoteContent({ content: null }), false);
    assert.equal(hasUsableNoteContent({ content: "   " }), false);
    assert.equal(hasUsableNoteContent({ content: "A real entry" }), true);
});

test("serializeNoteWithAnalysis includes the diagnosis in save responses", () => {
    const note = {
        toJSON: () => ({ note_id: 12, content: "A real entry" }),
    };

    assert.deepEqual(
        serializeNoteWithAnalysis(note, {
            predicted_status: "Normal",
            confidence_score: 0.91,
        }),
        {
            note_id: 12,
            content: "A real entry",
            predicted_status: "Normal",
            confidence_score: 0.91,
        }
    );
});
