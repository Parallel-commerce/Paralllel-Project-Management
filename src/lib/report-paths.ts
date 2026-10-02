export function projectReportsPath(projectId: string) {
  return `/reports/${projectId}`;
}

export function projectReportPath(projectId: string, reportId: string) {
  return `/reports/${projectId}/${reportId}`;
}
