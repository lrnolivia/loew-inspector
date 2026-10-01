import { useEffect, useRef } from "react";
import { glyph } from "../../../../packages/shared-ui/glyphs.js";
import { iconSlot, hydrateProjectIcons } from "../../public/project-icons.js";
import { projectLabel } from "../api";
import { useLiveRelay } from "../live";

export function ProjectSwitcher() {
  const { snapshot, project, selectProject } = useLiveRelay();
  const root = useRef<HTMLDivElement>(null);
  const projects = snapshot?.projects || [];
  useEffect(() => { if (root.current) void hydrateProjectIcons(root.current); }, [projects]);
  return <div className="project-context" ref={root}>
    <span className="project-context-label">project</span>
    <div className="project-tabs" role="group" aria-label="Project context">
      {[{ id: "", name: "all projects" }, ...[...projects].sort((a, b) => projectLabel(a.id).localeCompare(projectLabel(b.id)))].map(item => (
        <button className={`project-tab${project === item.id ? " active" : ""}`} type="button" aria-pressed={project === item.id} key={item.id} onClick={() => selectProject(item.id)}>
          <span className="project-tab-all" dangerouslySetInnerHTML={{ __html: item.id ? iconSlot(item.id) : glyph("projects") }} />
          <span>{item.id ? projectLabel(item.id) : item.name}</span>
        </button>
      ))}
    </div>
  </div>;
}
