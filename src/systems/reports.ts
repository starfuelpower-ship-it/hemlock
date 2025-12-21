import { Report } from "../types";
export function sortReportsNewestFirst(reports: Report[]) { return [...reports].sort((a,b) => (a.created_at < b.created_at ? 1 : -1)); }
export function unreadCount(reports: Report[]) { return reports.reduce((n,r)=> n + (r.is_unread ? 1 : 0), 0); }
