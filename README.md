# classroom50-autoenrollment

## Setup

1. Create a blank form. Copy the ID between `/d/` and `/edit` in its edit URL.
2. Add `classroom-autoenrollment.gs` to your Apps Script project. Fill in the fields marked `// FILLME` in `CONFIG`. Paste the form ID into `formId`, set `owner` to the GitHub organization or account that owns the repository, and add one entry to `classes` per course, mapping its uppercase code to the path of its existing roster CSV. Adjust `repo` and `branch` if they differ from `classroom50` and `main`.
3. As indicated by the `// FILLME` comment above `CONFIG`, set `GITHUB_TOKEN` in the Apps Script project’s script properties. The token must grant write access to the configured repository.
4. Run `installTrigger` and grant the requested Apps Script permissions. The function creates the questions, enables email collection, saves the question IDs, and installs the trigger. If the form is still unpublished, publish it in Google Forms.

You can rename and reorder the generated questions. If you change `CONFIG.classes`, run `installTrigger` again to update the course options.

To send GitHub organization invitations, set `CONFIG.inviteToOrganization` to `true`. Create a fine-grained personal access token as an organization owner and select the organization as **Resource owner**. Give the token **Contents → Read and write** for the roster repository and **Members → Read and write** under **Organization permissions**. If the organization requires token approval, wait for approval before setting the token as `GITHUB_TOKEN` in Apps Script. The **Members** permission covers both the [membership check](https://docs.github.com/en/rest/orgs/members#get-organization-membership-for-a-user) and the [invitation](https://docs.github.com/en/rest/orgs/members#create-an-organization-invitation).

After all selected rosters are updated, the script invites the submitted GitHub account as an organization member. Students accept the invitation in GitHub. Active or pending members are skipped. If a submission stopped with a permissions error after updating its rosters, it can be submitted again after replacing the token. Existing roster entries are updated by GitHub ID or username.
