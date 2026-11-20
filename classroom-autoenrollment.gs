
// FILLME: Set GITHUB_TOKEN in Apps Script's script properties.
const CONFIG = {
  formId: "FORM_ID", // FILLME
  owner: "ORG_NAME", // FILLME
  inviteToOrganization: false, // FILLME
  repo: "classroom50",
  branch: "main",
  classes: { // FILLME: one line for each class
    // class_acronym: "roster_path"
  },
  columns: [
    "username", "first_name", "last_name", "email", "section", "github_id", "role"
  ]
};

const FORM_FIELDS = {
  username: "Nombre de usuario en GitHub",
  personalEmail: "Correo electrónico (solo si el usuario es tu cuenta personal)",
  firstName: "Nombre",
  lastName: "Primer apellido",
  classes: "Curso al que perteneces"
};

function formItemIdsKey(formId) {
  return `FORM_ITEM_IDS_${formId}`;
}

function getFormItemIds(formId) {
  const saved = PropertiesService.getScriptProperties().getProperty(formItemIdsKey(formId));
  return saved ? JSON.parse(saved) : null;
}

function validateFormItems(form, itemIds) {
  for (const field of Object.keys(FORM_FIELDS)) {
    const type = field === "classes" ? FormApp.ItemType.CHECKBOX : FormApp.ItemType.TEXT;
    const item = Number.isInteger(itemIds[field]) ? form.getItemById(itemIds[field]) : null;
    if (!item || item.getType() !== type) {
      throw new Error(`The configured form is missing its ${field} question or its type changed.`);
    }
  }
}

/**
 * Configure the form and install its submit trigger.
 */
function installTrigger() {
  const classNames = Object.keys(CONFIG.classes);
  if (!classNames.length || Object.entries(CONFIG.classes).some(([name, path]) =>
    !name || name !== name.trim().toUpperCase() || typeof path !== "string" || !path.trim()
  )) {
    throw new Error("Set CONFIG.classes to uppercase class codes and non-empty roster paths.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const form = FormApp.openById(CONFIG.formId);
    const itemIds = getFormItemIds(form.getId());
    if (itemIds) {
      validateFormItems(form, itemIds);
      form.getItemById(itemIds.classes).asCheckboxItem().setChoiceValues(classNames);
    } else {
      createFormItems(form, classNames);
    }

    const triggerExists = ScriptApp.getProjectTriggers().some(trigger =>
      trigger.getHandlerFunction() === "onFormSubmit" &&
      trigger.getEventType() === ScriptApp.EventType.ON_FORM_SUBMIT &&
      trigger.getTriggerSourceId() === form.getId()
    );

    if (!triggerExists) {
      ScriptApp.newTrigger("onFormSubmit")
        .forForm(form)
        .onFormSubmit()
        .create();
    }

    console.log("Trigger configured.");
  } finally {
    lock.releaseLock();
  }
}

function createFormItems(form, classNames) {
  const items = form.getItems();
  const placeholder = items.length === 1 && isBlankFormPlaceholder(items[0])
    ? items[0]
    : null;
  if (items.length && !placeholder) {
    throw new Error("Use a blank form to run installTrigger for the first time.");
  }

  const itemIds = {};
  const createdItems = [];
  const alreadyCollectsEmail = form.collectsEmail();

  try {
    for (const [field, title] of Object.entries(FORM_FIELDS)) {
      const item = field === "classes" ? form.addCheckboxItem() : form.addTextItem();
      createdItems.push(item);
      itemIds[field] = item.getId();
      item.setTitle(title).setRequired(field !== "personalEmail");

      if (field === "classes") {
        item.setChoiceValues(classNames);
      } else if (field === "personalEmail") {
        item.setValidation(FormApp.createTextValidation().requireTextIsEmail().build());
      }
    }

    form.setCollectEmail(true);
    if (placeholder) {
      form.deleteItem(placeholder);
    }
    PropertiesService.getScriptProperties()
      .setProperty(formItemIdsKey(form.getId()), JSON.stringify(itemIds));
  } catch (error) {
    for (const item of createdItems.reverse()) {
      form.deleteItem(item);
    }
    form.setCollectEmail(alreadyCollectsEmail);
    throw error;
  }
}

function isBlankFormPlaceholder(item) {
  if (item.getType() !== FormApp.ItemType.MULTIPLE_CHOICE || item.getHelpText() ||
      !["", "Untitled Question", "Pregunta sin título"].includes(item.getTitle())) {
    return false;
  }

  const question = item.asMultipleChoiceItem();
  const choices = question.getChoices();
  return !question.isRequired() && !question.hasOtherOption() && choices.length === 1 &&
    ["Option 1", "Opción 1"].includes(choices[0].getValue());
}

/**
 * Runs when a form response is submitted.
 */
function onFormSubmit(e) {
  if (!e || !e.response) {
    throw new Error("This function requires a form submission.");
  }

  processResponse(e.response, e.source.getId());
}

/**
 * Extracts the submitted data from Google Forms.
 */
function processResponse(response, formId) {
  const itemIds = getFormItemIds(formId);
  if (!itemIds) {
    throw new Error("Run installTrigger for this form before processing responses.");
  }

  const answers = new Map();

  for (const answer of response.getItemResponses()) {
    answers.set(answer.getItem().getId(), answer.getResponse());
  }

  const getAnswer = field => answers.get(itemIds[field]);
  const readAnswer = field => String(getAnswer(field) ?? "").trim();

  const username = readAnswer("username").replace(/^@/, "");
  const firstName = readAnswer("firstName");
  const lastName = readAnswer("lastName");
  const personalEmail = readAnswer("personalEmail");

  const email = personalEmail ||
    response.getRespondentEmail() || "";

  // Checkbox questions return an array.
  const selection = getAnswer("classes");

  const classes = (
    Array.isArray(selection) ? selection : [selection]
  )
    .map(x => String(x ?? "").trim().toUpperCase())
    .filter(x => Object.hasOwn(CONFIG.classes, x));

  if (!username || !firstName || !lastName || !email) {
    throw new Error("Required student details are missing.");
  }

  if (!classes.length) {
    throw new Error("No valid class was selected.");
  }

  // Look up the numeric GitHub ID.
  const githubUserResponse = githubRequest(
    `https://api.github.com/users/${encodeURIComponent(username)}`,
    "get", undefined, [404]
  );

  if (githubUserResponse.getResponseCode() === 404) {
    throw new Error(`GitHub HTTP 404: No account found for "${username}". Check the submitted GitHub username.`);
  }

  const info = JSON.parse(githubUserResponse.getContentText());

  if (!Number.isSafeInteger(info.id)) {
    throw new Error(`Could not retrieve the ID for ${username}`);
  }

  const student = {
    username: info.login,
    first_name: firstName,
    last_name: lastName,
    email,
    section: "",
    github_id: String(info.id),
    role: "student"
  };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    for (const className of new Set(classes)) {
      updateRoster(CONFIG.classes[className], student);
    }

    if (CONFIG.inviteToOrganization) {
      inviteOrganizationMember(student.username, info.id);
    }
  } finally {
    lock.releaseLock();
  }

  console.log(
    `Processed ${student.username}: ${[...new Set(classes)].join(", ")}`
  );
}

function inviteOrganizationMember(username, githubId) {
  const orgUrl = `https://api.github.com/orgs/${encodeURIComponent(CONFIG.owner)}`;
  const orgRequest = (path, method, body, allowedStatus) => {
    const response = githubRequest(`${orgUrl}/${path}`, method, body, [allowedStatus, 403]);
    if (response.getResponseCode() === 403) {
      const detail = response.getContentText();
      const hint = detail.includes("Resource not accessible by personal access token")
        ? ` Check that GITHUB_TOKEN belongs to an organization owner and grants Members: Read and write for ${CONFIG.owner}.`
        : "";
      throw new Error(`GitHub HTTP 403 during ${method.toUpperCase()} ${orgUrl}/${path}: ${detail}${hint}`);
    }
    return response;
  };
  const hasMembership = () => {
    const response = orgRequest(`memberships/${encodeURIComponent(username)}`, "get", undefined, 404);
    if (response.getResponseCode() === 404) {
      return false;
    }
    const { state } = JSON.parse(response.getContentText());
    return state === "active" || state === "pending";
  };

  if (hasMembership()) {
    return;
  }

  const response = orgRequest("invitations", "post", {
    invitee_id: githubId,
    role: "direct_member"
  }, 422);

  if (response.getResponseCode() === 201) {
    console.log(`Invited ${username} to ${CONFIG.owner}.`);
  } else if (!hasMembership()) {
    throw new Error(`Could not invite ${username}: GitHub HTTP ${response.getResponseCode()}: ${response.getContentText()}`);
  }
}

/**
 * Downloads, updates, and uploads an existing CSV.
 */
function updateRoster(path, student) {
  const url =
    `https://api.github.com/repos/` +
    `${CONFIG.owner}/${CONFIG.repo}/contents/${path}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    // Fetch the file and its current SHA.
    const response = githubRequest(
      `${url}?ref=${encodeURIComponent(CONFIG.branch)}`,
      "get"
    );

    const file = JSON.parse(response.getContentText());

    const content = Utilities.newBlob(
      Utilities.base64Decode(
        file.content.replace(/\s/g, "")
      )
    ).getDataAsString("UTF-8")
      .replace(/^\uFEFF/, "");

    const rows = Utilities.parseCsv(
      content.replace(/[\r\n]+$/, "")
    );

    const header = rows.shift();

    if (
      JSON.stringify(header) !==
      JSON.stringify(CONFIG.columns)
    ) {
      throw new Error(`Unexpected header in ${path}`);
    }

    // Find the record by GitHub ID or username.
    const idxId = header.indexOf("github_id");
    const idxUser = header.indexOf("username");

    const rowIndex = rows.findIndex(row =>
      String(row[idxId]) === student.github_id ||
      String(row[idxUser]).toLowerCase() ===
        student.username.toLowerCase()
    );

    const newRow = header.map(c => student[c]);
    const existingRow = rows[rowIndex];

    if (existingRow?.length === newRow.length &&
        newRow.every((value, index) => value === existingRow[index])) {
      console.log(`${path} already up to date`);
      return;
    }

    if (rowIndex === -1) {
      rows.push(newRow);
    } else {
      rows[rowIndex] = newRow;
    }

    const csv = [header, ...rows]
      .map(f => f.map(escapeCsv).join(","))
      .join("\n") + "\n";

    const encodedContent = Utilities.base64Encode(
      Utilities.newBlob(
        csv, "text/csv", "roster.csv"
      ).getBytes()
    );

    // Use the SHA when writing to avoid overwriting concurrent changes.
    const uploadResponse = githubRequest(url, "put", {
      message: `Roster ${path}: ${student.username}`,
      content: encodedContent,
      sha: file.sha,
      branch: CONFIG.branch
    }, [409]);

    if (uploadResponse.getResponseCode() === 200) {
      console.log(`${path} updated`);
      return;
    }

    Utilities.sleep(500 * attempt);
  }

  throw new Error(`Repeated conflicts while updating ${path}`);
}

/**
 * Escapes a CSV field.
 */
function escapeCsv(value) {
  const s = String(value ?? "");
  return /[",\r\n]/.test(s)
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

/**
 * GitHub API client.
 */
function githubRequest(url, method, body, allowedStatuses = []) {
  const token = PropertiesService
    .getScriptProperties()
    .getProperty("GITHUB_TOKEN");

  if (!token) {
    throw new Error("Set GITHUB_TOKEN first.");
  }

  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    muteHttpExceptions: true
  };

  if (body !== undefined) {
    options.contentType = "application/json";
    options.payload = JSON.stringify(body);
  }

  const response = UrlFetchApp.fetch(url, options);
  const status = response.getResponseCode();

  if (
    (status < 200 || status >= 300) &&
    !allowedStatuses.includes(status)
  ) {
    throw new Error(
      `GitHub HTTP ${status}: ${response.getContentText()}`
    );
  }

  return response;
}
