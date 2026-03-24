/**
 * STRIXHAVEN GRADES TRACKER - Finale Version mit Checkbox-Logik & Filter
 */

// --- 1. Die Editor-Klasse (Das Notenblatt) ---
class StrixhavenGradesEditor extends Application {
    constructor(actorId, options = {}) {
        super(options);
        this.actorId = actorId;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "strixhaven-grades-editor",
            title: "Notenblatt bearbeiten",
            template: "modules/strixhaven-grades-tracker/templates/editor.hbs",
            width: 450,
            height: "auto",
            resizable: true
        });
    }

    async getData() {
        const studentData = game.settings.get("strixhaven-grades-tracker", "studentData") || {};
        const courseString = game.settings.get("strixhaven-grades-tracker", "courseList") || "";
        const allCourses = courseString.split(",").map(c => c.trim()).filter(c => c !== "");
        const student = studentData[this.actorId];

        // Bereitet die Daten für den {{#each courses}} Loop vor
        const coursesForTemplate = allCourses.map(c => ({
            name: c,
            value: student.grades?.[c] || 0,
            isEnrolled: student.grades ? student.grades.hasOwnProperty(c) : false
        }));

        return {
            name: student.name,
            courses: coursesForTemplate
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        // Da das Formular die Klasse .strixhaven-editor-form nutzt:
        html.on("submit", (e) => this._onSave(e));
    }

    async _onSave(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const newGrades = {};

        const courseString = game.settings.get("strixhaven-grades-tracker", "courseList") || "";
        const allCourses = courseString.split(",").map(c => c.trim()).filter(c => c !== "");

        allCourses.forEach(c => {
            // Holt die Checkbox und den Wert basierend auf dem Namen im Template
            const isEnrolled = form.querySelector(`[name="enroll.${c}"]`)?.checked;
            const gradeValue = form.querySelector(`[name="grade.${c}"]`)?.value;

            if (isEnrolled) {
                newGrades[c] = parseInt(gradeValue) || 0;
            }
        });

        let students = game.settings.get("strixhaven-grades-tracker", "studentData");
        if (students[this.actorId]) {
            students[this.actorId].grades = newGrades;
            await game.settings.set("strixhaven-grades-tracker", "studentData", students);
            
            // UI aktualisieren
            strixTool.application.render();
            this.close();
        }
    }
}

// --- 2. Die Haupt-Klasse (Das Bulletin) ---
class StrixhavenGradesTracker extends Application {
    constructor(options = {}) {
        super(options);
        this.currentFilter = "all";
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "strixhaven-grades-tracker",
            template: "modules/strixhaven-grades-tracker/templates/board.hbs",
            width: 700,
            height: "auto",
            resizable: true,
            dragDrop: [{ dragSelector: null, dropSelector: ".strixhaven-board-container" }]
        });
    }

    async getData() {
        const studentData = game.settings.get("strixhaven-grades-tracker", "studentData") || {};
        const courseString = game.settings.get("strixhaven-grades-tracker", "courseList") || "";
        const allCourses = courseString.split(",").map(c => c.trim()).filter(c => c !== "");

        // 1. Daten aufbereiten und Score berechnen
        let students = Object.values(studentData).map(s => {
            let score = 0;
            if (this.currentFilter === "all") {
                score = Object.values(s.grades || {}).reduce((a, b) => a + (parseInt(b) || 0), 0);
            } else {
                score = parseInt(s.grades?.[this.currentFilter]) || 0;
            }
            return { ...s, score: score, isGM: game.user.isGM };
        });

        // 2. Filtern: Nur Teilnehmer des Kurses anzeigen (wenn nicht "Alle")
        if (this.currentFilter !== "all") {
            students = students.filter(s => s.grades && s.grades.hasOwnProperty(this.currentFilter));
        }

        // 3. Sortieren
        students.sort((a, b) => b.score - a.score);

        return {
            students: students,
            allCourses: allCourses,
            currentFilter: this.currentFilter,
            isGlobal: this.currentFilter === "all",
            isGM: game.user.isGM
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find(".delete-student").click(this._onDeleteStudent.bind(this));
        html.find(".edit-student").click(this._onEditStudent.bind(this));
        html.find(".course-filter").change(this._onFilterChange.bind(this));
    }

    _onFilterChange(event) {
        this.currentFilter = event.target.value;
        this.render();
    }

    async _onDrop(event) {
        if (!game.user.isGM) return;
        let data;
        try { data = JSON.parse(event.dataTransfer.getData('text/plain')); } catch (err) { return; }
        if (data.type !== "Actor") return;
        const actor = await Actor.fromDropData(data);
        if (!actor) return;

        let students = game.settings.get("strixhaven-grades-tracker", "studentData");
        if (!students[actor.id]) {
            students[actor.id] = { id: actor.id, name: actor.name, img: actor.img, grades: {} };
            await game.settings.set("strixhaven-grades-tracker", "studentData", students);
            this.render();
        }
    }

    _onEditStudent(event) {
        const actorId = event.currentTarget.dataset.actorId;
        new StrixhavenGradesEditor(actorId).render(true);
    }

    async _onDeleteStudent(event) {
        const actorId = event.currentTarget.dataset.actorId;
        let students = game.settings.get("strixhaven-grades-tracker", "studentData");
        delete students[actorId];
        await game.settings.set("strixhaven-grades-tracker", "studentData", students);
        this.render();
    }
}

// --- 3. Initialisierung ---
const strixTool = {
    application: new StrixhavenGradesTracker(),
    onGetSceneControlButtons(controls) {
        const tokenTools = controls.tokens?.tools;
        if (!tokenTools) return;
        tokenTools.strixhavenGrades = {
            button: true, icon: "fas fa-graduation-cap", name: "strixhavenGrades",
            title: "Strixhaven Bulletin", visible: true,
            onChange: () => {
                if (strixTool.application.rendered) strixTool.application.close();
                else strixTool.application.render(true);
            },
        };
    }
};

Hooks.once("init", () => {
    game.settings.register("strixhaven-grades-tracker", "courseList", {
        scope: "world", config: true, type: String, 
        default: "GF1, GF2, ALC1, ALC2, MAG1, MAG2, HIS1, DRA1, MAT1, RUN1, BOT1, ILL1, SUM1, NEC1"
    });
    game.settings.register("strixhaven-grades-tracker", "studentData", {
        scope: "world", config: false, type: Object, default: {}
    });
});

Hooks.on("getSceneControlButtons", (controls) => strixTool.onGetSceneControlButtons(controls));