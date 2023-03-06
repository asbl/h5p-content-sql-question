/*jshint esversion: 6 */

export default class SQLQuestion extends H5P.CodeQuestion {
  /**
   * @constructor
   *
   * @param {object} params Parameters passed by the editor.
   * @param {number} contentId Content's id.
   * @param {object} [extras] Saved state, metadata, etc.
   */
  constructor(params, contentId, extras = {}) {
    super(params, contentId, extras);

    this.createRuntime = (isTest = false, testNumber = 0) => {
      this.runtime = new H5P.SQLRuntime({
        dbFile: this.dbFilePath,
        test: true,
        testNumber: testNumber,
        saveOutput: true,
        onSuccess: this.onSuccess,
        onError: this.onError,
      });
      return this.runtime
    };



    this.getEditorLayout = () => {
      const aceEditor = new H5P.Ace(this.editorParent, {
        getRuntime: this.getRuntime,
        code: this.defaultCode,
        hasButtons: true,
        hasConsole: true,
        height: 5,
        run: this.run,
        preCode: null,
        postCode: null,
        consoleType: "div",
        language: "sql",
        modifyEditor: this.modifyEditor
      });
      return aceEditor;
    }

    this.resultsToTable = (runtime) => {
      let html = "";
      const table = AsciiTable.factory({
        heading: runtime.outputArray[0].columns
        , rows: runtime.outputArray[0].values
      })
      html = table.toString()
      return html
    }

    this.updateTestCaseTable = (runtime) => {
      let outputTable = this.resultsToTable(runtime)
      const editorConsole = this.editor.getConsole();
      let outputDiv = document.createElement("div");
      outputDiv.classList.add("console-column")
      let html = ""
      html = "<h4>Output</h4>";
      html += `<pre id="${this.userTableUID}"class="h5p sql-question output-table">` + outputTable + "</pre>";
      outputDiv.innerHTML = html;

      let expectedDiv = document.createElement("div");
      expectedDiv.classList.add("console-column")
      let successClass = ""
      let success = this.checkTest(runtime, 0)
      if (success) {
        successClass = "match";
        html = "<h4>Success</h4>";
      }
      else {
        html = "<h4>Try again</h4>";
        successClass = "no-match";
      }

      html += `<pre class="h5p ${successClass} sql-question db-table">` + this.targetTable + "</pre>";
      if (success) {
        html += "\n ✓"
      }
      expectedDiv.innerHTML = html;
      editorConsole.innerHTML = "";
      editorConsole.appendChild(outputDiv);
      editorConsole.appendChild(expectedDiv);


      outputTable = document.getElementById(this.userTableUID);
      //make output Table clickable
      outputDiv.onclick = () => {
        let tableCopy = outputTable.innerHTML

        if (!navigator.clipboard) {
          // use old commandExec() way
        } else {
          navigator.clipboard.writeText(tableCopy).then(
            function () {
              alert("Table copied to clipboard"); // success 
            })
            .catch(
              function () {
                alert("Error when copying the table to the clipboard."); // error
              });
        }

      }
    }

    this.onError = () => {
      let console = this.editor.getConsole();
      let html = `<div class="error"><h2>Error!</h2>`;
      html += this.runtime.errorMessage;
      html += "</div>";
      console.innerHTML = html;
      this.setFeedback(`You habe an error in line in your sql-syntax`, this.getScore(), this.getMaxScore(), "Score");
    }


    this.checkTest = (runtime, testIndex) => {
      return (this.resultsToTable(runtime).trim() == this.targetTable.trim());
    }

    this.getMaxScore = () => {
      return 1;
    }

    this.modifyEditor = () => {
      const runtime = new H5P.SQLRuntime({ dbFile: this.dbFilePath, test: false });
      runtime.getAllTables().then((result) => {
        this.tables = result;
        let tableContent = "";
        this.tables.forEach(table => {
          tableContent = AsciiTable.factory({
            heading: table[1].columns
            , rows: table[1].values
          })
          this.editor.addPage(table[0], `<pre class="h5p sql-question db-table">` + tableContent.toString() + "</pre>", "sql-table")
          this.editor.buttons.push({
            identifier: table[0],
            name: table[0],
            class: table[0],
            page: table[0],
            additionalClass: "sql-table-button",
          })
          this.editor.pages.push({ name: table[0], })
        });
        this.editor.reloadButtons();


      });
    }

    this.allTables = null;
    this.tables = null;
    this.userTableUID = `h5p_user_table_${this.uid()}`;
    this.targetTable = (params.testCases[0][0] !== undefined) ? this.getDecodedCode(params.testCases[0][0]) : "empty";
    this.dbFile = params.dbFile;
    this.dbFilePath = H5P.getPath(this.dbFile.path, contentId);
    this.hasCanvas = false;
    this.hasConsole = false;
    this.hasRunButton = false;
    this.hasCheckButton = true;
    this.hasStopButton = false;
    this.hasAssets = true

  } // end of constructor
} // end of class




