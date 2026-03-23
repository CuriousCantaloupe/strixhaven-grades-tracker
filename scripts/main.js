/**
 * STRIXHAVEN GRADES TRACKER
 */

Hooks.once("init", () => {
    // Handlebars Helper registrieren
    Handlebars.registerHelper('eq', (a, b) => a === b);
    Handlebars.registerHelper('add', (a, b) => a + b);

    // Modul-Einstellungen registrieren
    game.settings.register("strixhaven-grades-tracker", "courseList", {
        name: "Verfügbare Kurse",
        hint: "Gib die Kürzel der Kurse kommagetrennt ein.",
        scope: "world",
        config: true,
        type: String,
        default: "GF1, GF2, ALC1, ALC2, MAG1, MAG2, HIS1, DRA1, MAT1, RUN1, BOT1, ILL1, SUM1, NEC1",
    });
});

/**
 * Editor für die Noten eines einzelnen Studenten
 */
class StrixhavenGradeEditor extends FormApplication {
    constructor(actor, opts = {}) {
        super(actor, opts);
        this.actor = actor;
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "strixhaven-grade-editor",
            title: "Noten eintragen",
            template: "modules/strixhaven-grades-tracker/templates/editor.hbs",
            width: 400,
            closeOnSubmit: true
        });
    }

    getData() {
        const settingsString = game.settings.get("strixhaven-grades-tracker", "courseList");
        const allCourses = settingsString.split(",").map(c => c.trim());
        const currentGrades = this.actor.getFlag("strixhaven-grades-tracker", "grades") || {};

        return {
            name: this.actor.name,
            courses: allCourses.map(c => ({
                name: c,
                value: currentGrades[c] !== undefined ? currentGrades[c] : ""
            }))
        };
    }

    async _updateObject(event, formData) {
        // expandObject stellt sicher, dass wir ein sauberes JS-Objekt erhalten (V12 kompatibel)
        const data = expandObject(formData);
        const grades = {};
        for (let [key, value] of Object.entries(data)) {
            if (value !== "" && value !== null) {
                grades[key] = Number(value);
            }
        }
        await this.actor.setFlag("strixhaven-grades-tracker", "grades", grades);
        
        // Alle offenen Instanzen des Trackers aktualisieren
        Object.values(ui.windows).forEach(w => {
            if (w.constructor.name === "StrixhavenGradesTracker") w.render(true);
        });
    }
}

/**
 * Die Haupt-Applikation (Das Ranking Board)
 */
class StrixhavenGradesTracker extends Application {
  constructor(options = {}) {
    super(options);
    this.currentFilter = "all";
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "strixhaven-grades-tracker",
      title: "Strixhaven: Akademisches Bulletin",
      template: "modules/strixhaven-grades-tracker/templates/board.hbs",
      width: 600,
      height: 750,
      resizable: true,
      classes: ["strixhaven-board"],
      dragDrop: [{ dropSelector: ".strixhaven-board-container" }] 
    });
  }

  async getData() {
    const settingsString = game.settings.get("strixhaven-grades-tracker", "courseList");
    const allCourses = settingsString.split(",").map(c => c.trim());
    
    let students = game.actors.contents
      .filter(a => a.getFlag("strixhaven-grades-tracker", "isStudent"))
      .map(student => {
        const grades = student.getFlag("strixhaven-grades-tracker", "grades") || {};
        let displayScore = 0;
        let isParticipant = true;

        if (this.currentFilter === "all") {
          displayScore = Object.values(grades).reduce((a, b) => a + b, 0);
        } else {
          if (grades[this.currentFilter] !== undefined) {
            displayScore = grades[this.currentFilter];
          } else {
            isParticipant = false;
          }
        }

        return {
          id: student.id,
          name: student.name,
          img: student.img,
          score: displayScore,
          active: isParticipant,
          isGM: game.user.isGM
        };
      })
      .filter(s => s.active);

    students.sort((a, b) => b.score - a.score);

    return { students, allCourses, currentFilter: this.currentFilter, isGlobal: this.currentFilter === "all" };
  }

  activateListeners(html) {
    // WICHTIG: html explizit in jQuery umwandeln für V12/V13
    html = $(html);
    super.activateListeners(html);

    html.find(".course-filter").change(ev => {
      this.currentFilter = ev.target.value;
      this.render(true);
    });

    html.find(".edit-student").click(async (ev) => {
      const actorId = $(ev.currentTarget).data("actor-id");
      const actor = game.actors.get(actorId);
      if (actor) new StrixhavenGradeEditor(actor).render(true);
    });

    html.find(".delete-student").click(async (ev) => {
      const actorId = $(ev.currentTarget).data("actor-id");
      const actor = game.actors.get(actorId);
      if (!actor) return;

      const confirm = await Dialog.confirm({
        title: "Student entfernen",
        content: `<p>Möchtest du <strong>${actor.name}</strong> wirklich von der Rangliste entfernen?</p>`,
        yes: () => true,
        no: () => false,
        defaultYes: false
      });

      if (confirm) {
        await actor.setFlag("strixhaven-grades-tracker", "isStudent", false);
        this.render(true);
      }
    });
  }

  async _onDrop(event) {
    const data = JSON.parse(event.dataTransfer.getData('text/plain'));
    if (data.type !== "Actor") return;
    const actor = await Actor.fromDropData(data);
    if (actor) {
        await actor.setFlag("strixhaven-grades-tracker", "isStudent", true);
        this.render(true);
    }
  }
}

/**
 * Sidebar Button Injektion
 */
Hooks.on("renderJournalDirectory", (app, html, data) => {
  const $html = $(html);
  
  // Prüfen, ob der Button schon existiert (verhindert Dopplungen beim Neurendern)
  if ($html.find(".strixhaven-btn").length > 0) return;

  const button = $(`<button class="strixhaven-btn"><i class="fas fa-scroll"></i> Strixhaven Ranking</button>`);
  
  button.click(() => {
    new StrixhavenGradesTracker().render(true);
  });

  $html.find(".header-actions").append(button);
});