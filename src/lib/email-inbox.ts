import { siteConfig } from "@/config/site";

/**
 * Emails orders and requests from the GitHub Pages copy, which has no server of its own,
 * through FormSubmit (formsubmit.co). It's an ordinary form post into a hidden frame, the way
 * FormSubmit takes attachments. The very first one makes FormSubmit ask the inbox's owner to
 * confirm; submissions are kept until then, but their attachments aren't.
 */

/** FormSubmit's limit for all attachments of one email together, with a little to spare. */
export const MAX_EMAIL_BYTES = 9.5 * 1024 * 1024;

export interface InboxFile {
  name: string;
  blob: Blob;
}

/** True when there's an inbox to email to. */
export function canEmail(): boolean {
  return Boolean(siteConfig.orderEmail);
}

/** Splits files into those that fit in one email (in order) and the names of those that don't. */
export function fitFiles(files: InboxFile[], limit = MAX_EMAIL_BYTES): { kept: InboxFile[]; skipped: string[] } {
  const kept: InboxFile[] = [];
  const skipped: string[] = [];
  let total = 0;
  for (const f of files) {
    if (total + f.blob.size <= limit) {
      kept.push(f);
      total += f.blob.size;
    } else skipped.push(f.name);
  }
  return { kept, skipped };
}

/**
 * Sends the fields and files to the inbox. Resolves once the post has gone through (the reply
 * comes from another site, so it can't be read), or after a long wait.
 */
export function sendToInbox(subject: string, fields: [string, string][], files: InboxFile[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!siteConfig.orderEmail) {
      reject(new Error("No inbox set"));
      return;
    }
    const target = `inbox-${Date.now().toString(36)}`;
    const frame = document.createElement("iframe");
    frame.name = target;
    frame.title = "Sending";
    frame.tabIndex = -1;
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden";

    const form = document.createElement("form");
    form.method = "POST";
    // As FormSubmit's instructions write it: formsubmit.co/you@example.com (the @ left as is).
    form.action = `https://formsubmit.co/${encodeURI(siteConfig.orderEmail.trim())}`;
    form.enctype = "multipart/form-data";
    form.target = target;
    form.style.display = "none";
    const add = (name: string, value: string) => {
      // Text areas keep line breaks; hidden inputs might not.
      const field = document.createElement("textarea");
      field.name = name;
      field.value = value;
      form.appendChild(field);
    };
    add("_subject", subject);
    add("_template", "table");
    add("_captcha", "false");
    add("_honey", "");
    for (const [name, value] of fields) add(name, value);
    try {
      files.forEach((f, i) => {
        const input = document.createElement("input");
        input.type = "file";
        input.name = `attachment-${i + 1}`;
        const list = new DataTransfer();
        list.items.add(f.blob instanceof File && f.blob.name === f.name ? f.blob : new File([f.blob], f.name, { type: f.blob.type || "application/octet-stream" }));
        input.files = list.files;
        form.appendChild(input);
      });
    } catch {
      // Very old browsers can't attach files this way: the order still goes, without pictures.
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
      setTimeout(() => {
        form.remove();
        frame.remove();
      }, 3000);
    };
    frame.addEventListener("load", () => {
      // The empty frame loading first doesn't count; FormSubmit's reply (another site) does.
      try {
        if (frame.contentWindow?.location.href === "about:blank") return;
      } catch {
        // Another site's page: that's the reply.
      }
      finish();
    });
    setTimeout(finish, 60_000);
    document.body.append(frame, form);
    form.submit();
  });
}
