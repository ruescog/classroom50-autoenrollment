# classroom50-autoenrollment

## Setup

1. Create a blank form. Copy the ID between `/d/` and `/edit` in its edit URL.
2. Add `classroom-autoenrollment.gs` to your Apps Script project. Fill in the fields marked `// FILLME` in `CONFIG`. Paste the form ID into `formId`, set `owner` to the GitHub organization or account that owns the repository, and add one entry to `classes` per course, mapping its uppercase code to the path of its existing roster CSV. Adjust `repo` and `branch` if they differ from `classroom50` and `main`.
3. As indicated by the `// FILLME` comment above `CONFIG`, set `GITHUB_TOKEN` in the Apps Script project’s script properties. The token must grant write access to the configured repository.
4. Run `installTrigger` and grant the requested Apps Script permissions. The function creates the questions, enables email collection, saves the question IDs, and installs the trigger. If the form is still unpublished, publish it in Google Forms.

You can rename and reorder the generated questions. If you change `CONFIG.classes`, run `installTrigger` again to update the course options.
