const db = require('../models');
const { Notes, Users, Analysis } = db;
require('dotenv').config();
const { analyzeWellbeing } = require('../services/gemini');
const { isAtLeastAge } = require('../utils/age');
const { hasUsableNoteContent, normalizeNoteInput } = require('../utils/note');

exports.createNote = async (req, res) => {
    const noteInput = normalizeNoteInput(req.body);
    const user_id = req.user_id;
    let t;

    if (!hasUsableNoteContent(noteInput)) {
        return res.status(422).json({
            error: true,
            message: "Note content is required",
        });
    }

    try {
        t = await db.sequelize.transaction();

        // Serialize note creation per user so concurrent requests cannot bypass
        // the one-active-note-per-Jakarta-day rule.
        const user = await Users.findByPk(user_id, {
            transaction: t,
            lock: t.LOCK.UPDATE,
        });

        if (!user) {
            await t.rollback();
            return res.status(404).json({
                error: true,
                message: "User not found",
            });
        }

        const todayDate = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Jakarta",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(new Date());

        const existingNote = await Notes.findOne({
            where: {
                user_id,
                isActive: true,
                createdAt: {
                    [db.Sequelize.Op.gte]: db.sequelize.literal(
                        `DATE('${todayDate}')`
                    ),
                    [db.Sequelize.Op.lt]: db.sequelize.literal(
                        `DATE('${todayDate}') + INTERVAL 1 DAY`
                    ),
                },
            },
            transaction: t,
        });

        if (existingNote) {
            if (hasUsableNoteContent(existingNote)) {
                await t.rollback();
                return res.status(409).json({
                    error: true,
                    message: "You have already created a note today",
                });
            }

            // Older Android versions created an empty server record before the
            // editor opened. Reuse that orphaned draft instead of blocking the
            // user for the rest of the day.
            const recoveredNote = await existingNote.update(
                noteInput,
                { transaction: t }
            );

            await t.commit();
            await analyzeNote(recoveredNote, user_id);

            return res.status(201).json({
                error: false,
                message: "Note created successfully",
                note: recoveredNote,
            });
        }

        const newNote = await Notes.create(
            {
                user_id,
                ...noteInput,
            },
            { transaction: t }
        );

        await t.commit();

        await analyzeNote(newNote, user_id);

        res.status(201).json({
            error: false,
            message: "Note created successfully",
            note: newNote,
        });
    } catch (error) {
        if (t) await t.rollback();
        res.status(400).json({
            error: true,
            message: error.message,
        });
    }
};
exports.getAllNotes = async (req, res) => {
    const user_id = req.user_id;
    let t;

    try {
        t = await db.sequelize.transaction();

        const user = await Users.findByPk(user_id, { transaction: t });

        if (!user) {
            await t.rollback();
            return res.status(404).json({
                error: true,
                message: 'User not found'
            });
        }

        const notes = await Notes.findAll({
            where: {
                user_id,
                isActive: true,
            },
            include: [
                {
                    model: Analysis,
                    as: "analysis",
                    attributes: ["predicted_status", "confidence_score"],
                },
            ],
            transaction: t,
        });

        const notesWithAnalysis = notes
            .filter(hasUsableNoteContent)
            .map((note) => {
                const analysis = note.analysis || {};

                const noteData = note.toJSON();
                delete noteData.analysis;

                return {
                    ...noteData,
                    predicted_status: analysis.predicted_status,
                    confidence_score: analysis.confidence_score,
                };
            });

        await t.commit();

        res.status(200).json({
            error: false,
            message: "Notes retrieved successfully",
            listNote: notesWithAnalysis,
        });
    } catch (error) {
        if (t) await t.rollback();
        res.status(500).json({
            error: true,
            message: error.message,
        });
    }
};

exports.getNoteById = async (req, res) => {
    const { id } = req.params;
    const user_id = req.user_id;
    let t;

    try {
        t = await db.sequelize.transaction();

        const note = await Notes.findOne({
            where: {
                note_id: id,
                user_id,
                isActive: true
            },
            transaction: t
        });

        if (!note) {
            await t.rollback();
            return res.status(404).json({
                error: true,
                message: 'Note not found'
            });
        }

        await t.commit();
        res.status(200).json({
            error: false,
            message: 'Note retrieved successfully',
            note
        });
    } catch (error) {
        if (t) await t.rollback();
        res.status(500).json({
            error: true,
            message: error.message
        });
    }
};

exports.updateNote = async (req, res) => {
    const { id } = req.params;
    const { title, content, emotion } = req.body;
    const user_id = req.user_id;
    let t;

    try {
        t = await db.sequelize.transaction();

        const note = await Notes.findOne({
            where: {
                note_id: id,
                user_id,
                isActive: true
            },
            transaction: t
        });

        if (!note) {
            await t.rollback();
            return res.status(404).json({
                error: true,
                message: 'Note not found'
            });
        }

        const nextNote = normalizeNoteInput({
            title: title ?? note.title,
            content: content ?? note.content,
            emotion: emotion ?? note.emotion,
        });

        if (!hasUsableNoteContent(nextNote)) {
            await t.rollback();
            return res.status(422).json({
                error: true,
                message: "Note content is required",
            });
        }

        const initialContent = note.content;
        const contentChanged = nextNote.content !== initialContent;

        const updatedNote = await note.update(
            {
                ...nextNote,
                // Normalization is no longer trusted from mobile clients. Clear a stale
                // normalized value so prediction falls back to the newly saved content.
                content_normalized: contentChanged ? null : note.content_normalized,
            },
            { transaction: t }
        );

        await t.commit();

        if (contentChanged) {
            await analyzeNote(updatedNote, user_id);
        }

        res.status(200).json({
            error: false,
            message: 'Note updated successfully',
            note: updatedNote
        });
    } catch (error) {
        if (t) await t.rollback();
        res.status(400).json({
            error: true,
            message: error.message
        });
    }
};

exports.deleteNote = async (req, res) => {
    const { id } = req.params;
    const user_id = req.user_id;
    let t;

    try {
        t = await db.sequelize.transaction();

        const note = await Notes.findOne({
            where: {
                note_id: id,
                user_id,
                isActive: true,
            },
            transaction: t,
        });

        if (!note) {
            await t.rollback();
            return res.status(404).json({
                error: true,
                message: "Note not found",
            });
        }

        await note.update(
            {
                isActive: false,
            },
            { transaction: t }
        );

        await t.commit();

        res.status(200).json({
            error: false,
            message: "Note deleted successfully",
        });
    } catch (error) {
        if (t) await t.rollback();
        res.status(400).json({
            error: true,
            message: error.message,
        });
    }
};

const analyzeNote = async (note, user_id) => {
    try {
        const user = await Users.findByPk(user_id, {
            attributes: ["birthday"],
        });
        if (!user || !isAtLeastAge(user.birthday, 18)) {
            return null;
        }

        const { predicted_status, confidence_score, model } =
            await analyzeWellbeing(note.content);

        const findNoteById = await Analysis.findOne({
            where: {
                note_id: note.note_id,
            },
        });

        if (findNoteById) {
            const updatedAnalysis = await findNoteById.update({
                predicted_status: predicted_status,
                confidence_score,
            });
            console.log(`Journal analysis updated with ${model}`);
            return updatedAnalysis;
        } else {
            const newAnalysis = await Analysis.create({
                note_id: note.note_id,
                predicted_status: predicted_status,
                confidence_score,
            });
            console.log(`Journal analysis created with ${model}`);
            return newAnalysis;
        }
    } catch (error) {
        console.error("Error analyzing notes:", error.message);
        console.error(error.stack);
        return null;
    }
};
