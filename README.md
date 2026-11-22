# classroom50-autoenrollment

## Setup

1. Create a blank form. Copy the ID between `/d/` and `/edit` in its edit URL.
2. Add `classroom-autoenrollment.gs` to your Apps Script project. Fill in the fields marked `// FILLME` in `CONFIG`. Paste the form ID into `formId`, set `owner` to the GitHub organization or account that owns the repository, and add one entry to `classes` per course, mapping its uppercase code to the path of its existing roster CSV. Adjust `repo` and `branch` if they differ from `classroom50` and `main`.
3. As indicated by the `// FILLME` comment above `CONFIG`, set `GITHUB_TOKEN` in the Apps Script project’s script properties. The token must grant write access to the configured repository.
4. Run `installTrigger` and grant the requested Apps Script permissions. The function creates the questions, enables email collection, saves the question IDs, and installs the trigger. If the form is still unpublished, publish it in Google Forms.

You can rename and reorder the generated questions. If you change `CONFIG.classes`, run `installTrigger` again to update the course options.

To enable GitHub organization and team enrollment, set `CONFIG.inviteToOrganization` to `true`. Each configured course needs an existing team with the slug `classroom50-{class_acronym}` in lowercase. For example, `POO` uses `classroom50-poo`.

Create a fine-grained personal access token as an organization owner and select the organization as **Resource owner**. Give the token **Contents → Read and write** for the roster repository and **Members → Read and write** under **Organization permissions**. **Members** covers [organization invitations](https://docs.github.com/en/rest/orgs/members#create-an-organization-invitation) and [team membership changes](https://docs.github.com/en/rest/teams/members#add-or-update-team-membership-for-a-user). If the organization requires token approval, wait for approval before setting the token as `GITHUB_TOKEN` in Apps Script.

The script includes all selected teams in a new organization invitation. For existing or pending organization members, it adds any missing team memberships and preserves existing team roles. Team access becomes active when the student accepts the organization invitation. The script updates the selected CSVs after GitHub has accepted the invitation or team membership requests, while the student's acceptance may still be pending. A failed submission can be retried after fixing the cause. Existing roster entries are updated by GitHub ID or username.
