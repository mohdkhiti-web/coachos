import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { DrillDiagram } from "@/components/features/drills/drill-diagram";
import { cn } from "@/lib/cn";
import {
  designCssVars,
  type ActivityHead,
  type BandBlock,
  type Cell,
  type CoverContent,
  type DocumentModel,
  type DocumentPage,
  type EquipmentItem,
  type Fact,
  type Figure,
  type Fragment,
  type Row,
  type TimelineRow,
  type Unit,
} from "@/modules/documents";
import { formatClockTime, formatDateOnly } from "@/modules/plans/format";
import { formatOffset } from "@/modules/plans/schedule";
import "@/styles/document.css";

/**
 * The printed session, drawn from a DocumentModel. These are THE page components: the on-screen preview, browser
 * print and (later) the PDF renderer all render this, so what is previewed is what is printed. It draws what the
 * model decided — where pages break, what is on each — and decides nothing itself.
 *
 * Environment-agnostic on purpose (no state, no effects, no browser API): it renders on the server or the client.
 * Every text comes from the model's raw values and the `sessions.document` messages; dates and times are formatted
 * for the viewer's locale here, never in the model.
 */

/** `logoSrc` turns a stored logo's id into an image address. Logo storage arrives in a later step; until then nothing resolves. */
export type LogoSrc = (assetId: string) => string | null;

const style = (vars: Record<string, string | number>) => vars as React.CSSProperties;
const mm = (n: number) => `${n}mm`;

export const DocumentPages = React.memo(function DocumentPages({
  model,
  logoSrc,
  className,
}: {
  model: DocumentModel;
  logoSrc?: LogoSrc;
  className?: string;
}) {
  const vars = React.useMemo(() => designCssVars(model.design, model.geometry), [model]);
  return (
    <div className={cn("doc", className)} style={style(vars)} data-testid="document">
      {model.pages.map((page) => (
        <PageView key={page.number} page={page} model={model} logoSrc={logoSrc} />
      ))}
    </div>
  );
});

// ---- one sheet ---------------------------------------------------------------------------------

function PageView({
  page,
  model,
  logoSrc,
}: {
  page: DocumentPage;
  model: DocumentModel;
  logoSrc?: LogoSrc;
}) {
  const t = useTranslations("sessions.document");
  const { design } = model;
  return (
    <section
      className="doc-page"
      aria-label={t("pageLabel", { page: page.number, total: model.pageCount })}
      data-page={page.number}
      data-kind={page.kind}
      data-paper={design.page.paper}
      data-orientation={design.page.orientation}
      data-border={design.frame.border}
      data-divider={design.frame.divider}
    >
      {page.kind === "cover" ? (
        <Cover cover={page.cover} logoSrc={logoSrc} />
      ) : (
        <>
          <RunningHeader model={model} logoSrc={logoSrc} />
          <div className={cn("doc-body", page.columns === 2 && "doc-body--cols")}>
            {page.columns === 2
              ? [0, 1].map((column) => (
                  <div key={column} className="doc-col">
                    {page.fragments
                      .filter((f) => f.column === column)
                      .map((f, i) => (
                        <FragmentView key={`${f.groupId}-${i}`} fragment={f} />
                      ))}
                  </div>
                ))
              : page.fragments.map((f, i) => (
                  <FragmentView key={`${f.groupId}-${i}`} fragment={f} />
                ))}
          </div>
          <RunningFooter model={model} page={page.number} />
        </>
      )}
    </section>
  );
}

function RunningHeader({ model, logoSrc }: { model: DocumentModel; logoSrc?: LogoSrc }) {
  const { header } = model;
  const src = header.logo ? (logoSrc?.(header.logo.assetId) ?? null) : null;
  if (header.style === "none") return null;
  return (
    <header className="doc-head" data-style={header.style}>
      <div className="doc-head__bar">
        {/* a stored logo, when logo storage exists; decorative — the club's name is beside it */}
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- a document image: fixed size, printed as-is
          <img className="doc-head__logo" src={src} alt="" />
        ) : null}
        <span className="doc-head__brand">{header.brand}</span>
        <span className="doc-head__club">{header.clubName}</span>
        <span className="doc-head__title">{header.title}</span>
      </div>
    </header>
  );
}

function RunningFooter({ model, page }: { model: DocumentModel; page: number }) {
  const t = useTranslations("sessions.document");
  const locale = useLocale();
  const { footer } = model;
  const left = [footer.coachName, footer.date ? formatDateOnly(footer.date, locale) : ""]
    .filter(Boolean)
    .join(" · ");
  return (
    <footer className="doc-foot">
      <span>{left}</span>
      <span className="doc-foot__mid">{footer.text}</span>
      <span className="doc-foot__page">{t("footer.page", { page, total: model.pageCount })}</span>
    </footer>
  );
}

// ---- the cover ---------------------------------------------------------------------------------

function Cover({ cover, logoSrc }: { cover: CoverContent; logoSrc?: LogoSrc }) {
  const t = useTranslations("sessions.document");
  const src = cover.logo ? (logoSrc?.(cover.logo.assetId) ?? null) : null;
  const team = cover.facts.find((f) => f.key === "team");
  const rest = cover.facts.filter((f) => f.key !== "team");
  return (
    <div className="doc-cover">
      <div className="doc-cover__band">
        <div className="doc-cover__brand">
          <span>{t("brand")}</span>
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- a document image: fixed size, printed as-is
            <img className="doc-cover__logo" src={src} alt="" />
          ) : null}
        </div>
        <h2 className="doc-cover__title">{cover.title}</h2>
        {team && team.value.t === "text" ? (
          <p className="doc-cover__team">{team.value.text}</p>
        ) : null}
        {cover.clubName ? <p className="doc-cover__team">{cover.clubName}</p> : null}
      </div>
      {rest.length > 0 ? <FactsList facts={rest} className="doc-cover__facts" /> : null}
      {cover.primaryObjective || cover.secondaryObjectives.length > 0 ? (
        <div className="doc-cover__objectives">
          <div>
            <div className="doc-label">{t("objectives.main")}</div>
            <p className="doc-objectives__main">{cover.primaryObjective}</p>
          </div>
          {cover.secondaryObjectives.length > 0 ? (
            <div>
              <div className="doc-label">{t("objectives.also")}</div>
              <ul className="doc-objectives__also">
                {cover.secondaryObjectives.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="doc-cover__foot">{t("cover.preparedWith")}</p>
    </div>
  );
}

// ---- values ------------------------------------------------------------------------------------

function useFactText() {
  const t = useTranslations("sessions.document");
  const td = useTranslations("drills");
  const locale = useLocale();
  return (fact: Fact): string => {
    const v = fact.value;
    switch (v.t) {
      case "text":
        return v.text;
      case "number":
        return String(v.n);
      case "date":
        return formatDateOnly(v.iso, locale);
      case "time":
        return formatClockTime(v.hm, locale) + (v.nextDay ? ` ${t("nextDay")}` : "");
      case "minutes":
        return t("minutes", { count: v.n });
      case "level":
        return td(`levels.${v.level}`);
    }
  };
}

function FactsList({
  facts,
  across,
  className,
  estimate,
}: {
  facts: Fact[];
  across?: number;
  className?: string;
  estimate?: number;
}) {
  const t = useTranslations("sessions.document");
  const text = useFactText();
  return (
    <dl
      className={cn("doc-facts", className)}
      style={across ? style({ "--across": across }) : undefined}
      data-est={estimate}
    >
      {facts.map((f) => (
        <div key={f.key}>
          <dt className="doc-fact__label">{t(`facts.${f.key}`)}</dt>
          <dd className="doc-fact__value">{text(f)}</dd>
        </div>
      ))}
    </dl>
  );
}

function EquipmentText({ item }: { item: EquipmentItem }) {
  const t = useTranslations("sessions.document");
  if (item.per === "player") return <>{t("equipment.perPlayer", { count: item.quantity })}</>;
  if (item.per === "pair") return <>{t("equipment.perPair", { count: item.quantity })}</>;
  return item.quantity > 1 ? <>{t("equipment.count", { count: item.quantity })}</> : null;
}

function useEquipmentLine() {
  const t = useTranslations("sessions.document");
  return (item: EquipmentItem) => {
    if (item.per === "player")
      return `${item.name} ${t("equipment.perPlayer", { count: item.quantity })}`;
    if (item.per === "pair")
      return `${item.name} ${t("equipment.perPair", { count: item.quantity })}`;
    return item.quantity > 1
      ? `${item.name} ${t("equipment.count", { count: item.quantity })}`
      : item.name;
  };
}

// ---- fragments ---------------------------------------------------------------------------------

function FragmentView({ fragment }: { fragment: Fragment }) {
  switch (fragment.kind) {
    case "activity":
      return <ActivityFragment fragment={fragment} />;
    case "break":
      return <BreakStrip fragment={fragment} />;
    case "timeline":
      return <TimelineFragment fragment={fragment} />;
    default:
      return <SectionFragment fragment={fragment} />;
  }
}

function SectionHeading({ id, kind, continued }: { id: string; kind: string; continued: boolean }) {
  const t = useTranslations("sessions.document");
  return (
    <h2 id={id} className="doc-sec-head">
      {t(`sections.${kind}`)}
      {continued ? <span className="doc-sec-head__more">{t("continued")}</span> : null}
    </h2>
  );
}

function SectionFragment({ fragment }: { fragment: Fragment }) {
  const id = React.useId();
  return (
    <section
      className="doc-frag"
      aria-labelledby={id}
      data-frag={fragment.kind}
      data-est={fragment.heightMm}
    >
      <SectionHeading id={id} kind={fragment.kind} continued={fragment.continued} />
      <div className="doc-rows">
        {fragment.units.map((u, i) => (
          <RowView key={i} unit={u} />
        ))}
      </div>
    </section>
  );
}

function TimelineFragment({ fragment }: { fragment: Fragment }) {
  const t = useTranslations("sessions.document");
  const id = React.useId();
  return (
    <section
      className="doc-frag"
      aria-labelledby={id}
      data-frag="timeline"
      data-est={fragment.heightMm}
    >
      <SectionHeading id={id} kind="timeline" continued={fragment.continued} />
      <table className="doc-table">
        <colgroup>
          <col className="col-time" />
          <col />
          <col className="col-phase" />
          <col className="col-duration" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">{t("timeline.time")}</th>
            <th scope="col">{t("timeline.activity")}</th>
            <th scope="col">{t("timeline.phase")}</th>
            <th scope="col">{t("timeline.duration")}</th>
          </tr>
        </thead>
        <tbody>
          {fragment.units.map((u, i) =>
            u.row.t === "timeline" ? <TimelineTableRow key={i} row={u.row.row} unit={u} /> : null,
          )}
        </tbody>
      </table>
    </section>
  );
}

function PhaseLabel({ phase }: { phase: string | null }) {
  const t = useTranslations("sessions.document");
  const td = useTranslations("drills");
  if (!phase) return null;
  return (
    <span className="doc-phase" style={style({ "--phase": `var(--phase-${phase})` })}>
      <span className="doc-phase__dot" aria-hidden />
      {phase === "break" ? t("break") : td(`phases.${phase}`)}
    </span>
  );
}

function TimelineTableRow({ row, unit }: { row: TimelineRow; unit: Unit }) {
  const t = useTranslations("sessions.document");
  return (
    <tr data-kind={row.kind} data-est={unit.heightMm}>
      <td className="doc-table__time">
        {formatOffset(row.startMin)}–{formatOffset(row.endMin)}
      </td>
      <td>
        <div className="doc-table__activity">
          <span className="doc-table__num">{row.number ?? ""}</span>
          <span>{row.title}</span>
        </div>
      </td>
      <td>
        <PhaseLabel phase={row.phase} />
      </td>
      <td className="doc-table__duration">{t("minutes", { count: row.durationMin })}</td>
    </tr>
  );
}

function BreakStrip({ fragment }: { fragment: Fragment }) {
  const t = useTranslations("sessions.document");
  const unit = fragment.units[0];
  if (!unit || unit.row.t !== "break") return null;
  const row = unit.row.row;
  return (
    <div className="doc-break doc-frag" data-frag="break" data-est={fragment.heightMm}>
      <strong>{row.title}</strong>
      <span className="doc-break__time">
        {formatOffset(row.startMin)}–{formatOffset(row.endMin)} ·{" "}
        {t("minutes", { count: row.durationMin })}
      </span>
    </div>
  );
}

// ---- an activity -------------------------------------------------------------------------------

function ActivityMeta({ head }: { head: ActivityHead }) {
  const t = useTranslations("sessions.document");
  const td = useTranslations("drills");
  const items: string[] = [];
  if (head.phase) items.push(td(`phases.${head.phase}`));
  if (head.playersMin !== null && head.playersMax !== null) {
    items.push(
      head.playersMin === head.playersMax
        ? t("meta.playersOne", { count: head.playersMin })
        : t("meta.playersRange", { min: head.playersMin, max: head.playersMax }),
    );
  }
  if (head.format) {
    const format = td.has(`formats.${head.format}`) ? td(`formats.${head.format}`) : head.format;
    items.push(t("meta.format", { value: format }));
  }
  if (head.intensity)
    items.push(t("meta.intensity", { level: td(`intensities.${head.intensity}`) }));
  if (head.repetitions) items.push(t("meta.reps", { count: head.repetitions }));
  if (items.length === 0) return null;
  return (
    <div className="doc-act__meta">
      {items.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
}

function ActivityTime({ head, row = false }: { head: ActivityHead; row?: boolean }) {
  const t = useTranslations("sessions.document");
  return (
    <div className={cn("doc-act__time", row && "doc-act__time--row")}>
      <strong>
        {formatOffset(head.startMin)}–{formatOffset(head.endMin)}
      </strong>
      <span>{t("minutes", { count: head.durationMin })}</span>
    </div>
  );
}

function ActivityFragment({ fragment }: { fragment: Fragment }) {
  const t = useTranslations("sessions.document");
  const head = fragment.activity;
  if (!head) return null;
  const continued = fragment.continued;
  return (
    <article
      className={cn("doc-act doc-frag", continued && "doc-act--continued")}
      style={style({ "--phase": `var(--phase-${head.phase ?? "break"})` })}
      aria-label={head.title}
      data-frag="activity"
      data-est={fragment.heightMm}
    >
      <header className="doc-act__head">
        <div className="doc-act__top">
          <span className="doc-act__num">{head.number}</span>
          <h3 className="doc-act__title">
            <span className="doc-act__name">{head.title}</span>
            {continued ? <span className="doc-act__more"> {t("continued")}</span> : null}
          </h3>
          {continued || head.narrow ? null : <ActivityTime head={head} />}
        </div>
        {continued || !head.narrow ? null : <ActivityTime head={head} row />}
        {continued ? null : <ActivityMeta head={head} />}
      </header>
      <div className="doc-act__body">
        {fragment.units.map((u, i) => (
          <RowView key={i} unit={u} />
        ))}
      </div>
    </article>
  );
}

// ---- rows --------------------------------------------------------------------------------------

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="doc-label">{label}</div>
      {children}
    </div>
  );
}

function FigureView({ figure }: { figure: Figure }) {
  return (
    <figure className="doc-fig" style={{ width: mm(figure.widthMm) }}>
      <div
        className="doc-fig__box"
        style={{ width: mm(figure.widthMm), height: mm(figure.heightMm) }}
      >
        <DrillDiagram diagram={figure.diagram} title={figure.title || undefined} theme="print" />
      </div>
      {figure.title ? <figcaption className="doc-fig__cap">{figure.title}</figcaption> : null}
    </figure>
  );
}

function BlockView({ block }: { block: BandBlock }) {
  const t = useTranslations("sessions.document");
  const equipmentLine = useEquipmentLine();
  switch (block.b) {
    case "text":
      return (
        <Labeled label={t(`labels.${block.label}`) + (block.continued ? ` ${t("continued")}` : "")}>
          <p className="doc-text">{block.text}</p>
        </Labeled>
      );
    case "equipment":
      return (
        <Labeled label={t("labels.equipment")}>
          <p className="doc-text">{block.items.map(equipmentLine).join(", ")}</p>
        </Labeled>
      );
    case "figure":
      return <FigureView figure={block.figure} />;
    case "cell":
      return <CellView cell={block.cell} />;
  }
}

function CellView({ cell }: { cell: Cell }) {
  const t = useTranslations("sessions.document");
  const label = t(`cells.${cell.key}`) + (cell.continued ? ` ${t("continued")}` : "");
  if (cell.text !== null) {
    return (
      <Labeled label={label}>
        <p className="doc-text">{cell.text}</p>
      </Labeled>
    );
  }
  const List = cell.ordered ? "ol" : "ul";
  return (
    <Labeled label={label}>
      <List
        className={cn("doc-list", cell.ordered && "doc-list--ordered")}
        style={cell.ordered ? { counterReset: `item ${cell.start - 1}` } : undefined}
      >
        {cell.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </List>
    </Labeled>
  );
}

function RowView({ unit }: { unit: Unit }) {
  const t = useTranslations("sessions.document");
  const row: Row = unit.row;
  const est = unit.heightMm;
  switch (row.t) {
    case "facts":
      return <FactsList facts={row.facts} across={row.across} estimate={est} />;
    case "objectives":
      return (
        <div data-est={est}>
          {row.primary || row.secondary.length > 0 ? (
            <div className="doc-objectives">
              <div>
                {row.primary ? (
                  <>
                    <div className="doc-label">{t("objectives.main")}</div>
                    <p className="doc-objectives__main">{row.primary}</p>
                  </>
                ) : null}
              </div>
              <div>
                {row.secondary.length > 0 ? (
                  <>
                    <div className="doc-label">{t("objectives.also")}</div>
                    <ul className="doc-objectives__also">
                      {row.secondary.map((o) => (
                        <li key={o}>{o}</li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
          {row.goal ? (
            <div className={row.primary || row.secondary.length > 0 ? "doc-goal" : undefined}>
              <div className="doc-label">{t("objectives.goal")}</div>
              <p className="doc-text">{row.goal}</p>
            </div>
          ) : null}
        </div>
      );
    case "equipment":
      return (
        <ul className="doc-equip" style={style({ "--across": row.across })} data-est={est}>
          {row.items.map((item) => (
            <li key={item.name}>
              <span className="doc-check" aria-hidden />
              <span>
                {item.name}{" "}
                <span className="doc-qty">
                  <EquipmentText item={item} />
                </span>
              </span>
            </li>
          ))}
        </ul>
      );
    case "band":
      return row.left.length + row.right.length === 0 ? null : (
        <div className="doc-band" data-est={est}>
          <div className="doc-bandcol" style={{ width: mm(row.leftMm) }}>
            {row.left.map((block, i) => (
              <BlockView key={i} block={block} />
            ))}
          </div>
          {row.right.length > 0 ? (
            <div className="doc-bandcol" style={{ width: mm(row.rightMm) }}>
              {row.right.map((block, i) => (
                <BlockView key={i} block={block} />
              ))}
            </div>
          ) : null}
        </div>
      );
    case "text":
      return (
        <p className="doc-text" data-est={est}>
          {row.text}
        </p>
      );
    case "reflection":
      return (
        <div data-est={est}>
          <div className="doc-reflect__label">{t(`reflection.${row.prompt}`)}</div>
          <div
            className="doc-reflect__box"
            data-blank={row.text ? "false" : "true"}
            style={{ height: mm(row.boxMm) }}
          >
            {row.text}
          </div>
        </div>
      );
    // a table row and a break strip are drawn by their own fragments
    case "timeline":
    case "break":
      return null;
  }
}
