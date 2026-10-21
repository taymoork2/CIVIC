import type { ReactNode, RefObject } from 'react'
import { PanelLeft, Pencil, Play, Search } from '@civic/shell/icons'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbSeparator } from '@civic/shell/ui/breadcrumb'
import { Button } from '@civic/shell/ui/button'
import { IconButton } from '@civic/shell/ui/icon-button'
import { DesktopProjectTabs, type useDesktopProjects } from './desktop-project-tabs'
import { DetailsMenu, ViewportPicker, PreviewThemeControls, type WorkspacePanel } from './workspace-tools'
import type { PreviewViewport } from './viewport-presets'

type HeaderProps = {
  desktop: ReturnType<typeof useDesktopProjects>; openPicker: (replace: boolean, trigger: HTMLButtonElement) => void; projects: ReactNode
  searchTrigger: RefObject<HTMLButtonElement | null>; onSearch: () => void
  onSettings: () => void
  playLabel: string; playPressed: boolean; playDisabled: boolean; onPlay: () => void
  showEdit: boolean; editPressed: boolean; editDisabled: boolean; onEdit: () => void
  pane: WorkspacePanel | null; setPane: (pane: WorkspacePanel | null) => void; proposals: number
}

export function WorkspaceHeader({ desktop, openPicker, projects, searchTrigger, onSearch, onSettings, playLabel, playPressed, playDisabled, onPlay, showEdit, editPressed, editDisabled, onEdit, pane, setPane, proposals }: HeaderProps) {
  return <header className="rh-brand">
    {!window.civicDesktop && <strong>CIVIC</strong>}
    {window.civicDesktop && <DesktopProjectTabs state={desktop} openPicker={openPicker} />}
    {projects}
    <div className="civic-workspace-actions">
      <IconButton ref={searchTrigger} icon={Search} label="Search this project" shortcut="⌘K" onClick={onSearch} />
      <Button aria-label={playLabel} aria-pressed={playPressed} disabled={playDisabled} onClick={onPlay}><Play aria-hidden="true" /><span className="civic-play-label">{playLabel === 'Retry preview' ? 'Retry' : 'Play'}</span></Button>
      {showEdit && <IconButton icon={Pencil} label="Edit proposal" aria-pressed={editPressed} disabled={editDisabled} onClick={onEdit} />}
      <DetailsMenu pane={pane} setPane={setPane} proposals={proposals} onSettings={onSettings} />
    </div>
  </header>
}

export function WorkspaceMapBar({ outline, toggleOutline, onApp, flowLabel, onFlow, selectedLabel, onSelection, viewport, busy, disabled, reason, changeViewport, themes, changeAppearance, themeDisabled, resumeLabel, onResume }: {
  outline: boolean; toggleOutline: () => void; onApp: () => void; flowLabel: string; onFlow: () => void; selectedLabel?: string; onSelection: () => void
  viewport: PreviewViewport; busy: boolean; disabled: boolean; reason?: string; changeViewport: (size: Pick<PreviewViewport, 'width' | 'height' | 'preset'>) => void
  themes?: { id: string; label: string }[]; changeAppearance: (patch: Partial<PreviewViewport>) => void; themeDisabled: boolean
  resumeLabel?: string; onResume: () => void
}) {
  return <div className="rh-map-bar">
    <IconButton icon={PanelLeft} label="Toggle journey outline" aria-controls="civic-journey-outline" aria-expanded={outline} onClick={toggleOutline} />
    <Breadcrumb className="rh-breadcrumb" aria-label="Canvas location"><BreadcrumbList className="cv:flex-nowrap cv:gap-0"><BreadcrumbItem><Button variant="ghost" size="sm" onClick={onApp}>App</Button></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><Button variant="ghost" size="sm" onClick={onFlow}>{flowLabel}</Button></BreadcrumbItem>{selectedLabel && <><BreadcrumbSeparator /><BreadcrumbItem><Button variant="ghost" size="sm" onClick={onSelection}>{selectedLabel}</Button></BreadcrumbItem></>}</BreadcrumbList></Breadcrumb>
    <ViewportPicker viewport={viewport} busy={busy} disabled={disabled} reason={reason} changeViewport={changeViewport} />
    <PreviewThemeControls viewport={viewport} themes={themes} disabled={busy || themeDisabled} change={changeAppearance} />
    {resumeLabel && <Button variant="outline" className="rh-resume" onClick={onResume}>{resumeLabel}</Button>}
  </div>
}
