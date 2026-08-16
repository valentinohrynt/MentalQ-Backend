const test = require("node:test");
const assert = require("node:assert/strict");
const {
    hasUsableNoteContent,
    normalizeNoteInput,
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
