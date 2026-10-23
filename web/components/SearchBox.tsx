import { useEffect, useId, useRef, useState } from "react";
import { loadPlaces, searchPlaces, type Place } from "@/lib/search";
import styles from "./Atlas.module.css";

/** A combobox: type a province or district (Turkish letters optional), pick with the mouse or
 *  with ↑ ↓ and Enter. The index is only fetched once the box is used. */
export default function SearchBox({ onPick }: { onPick: (place: Place) => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [wanted, setWanted] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!wanted || places || failed) return;
    let cancelled = false;
    loadPlaces().then((data) => {
      if (!cancelled) setPlaces(data);
    }).catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [wanted, places, failed]);

  const results = places ? searchPlaces(places, query) : [];
  const expanded = open && results.length > 0;

  const pick = (place: Place) => {
    onPick(place);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className={styles.search}>
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-label="İl ya da ilçe ara"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={`${id}-list`}
        aria-activedescendant={expanded ? `${id}-${active}` : undefined}
        aria-describedby={failed ? `${id}-error` : undefined}
        placeholder="İl ya da ilçe ara"
        value={query}
        onFocus={() => setWanted(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && expanded) setActive((active + 1) % results.length);
          else if (e.key === "ArrowUp" && expanded) setActive((active - 1 + results.length) % results.length);
          else if (e.key === "Enter" && expanded) pick(results[active]);
          else if (e.key === "Escape") setOpen(false);
          else return;
          e.preventDefault();
          e.stopPropagation(); // Escape here should not also close the region panel
        }}
      />
      {failed && (
        <div id={`${id}-error`} className={styles.searchError} role="alert">
          <p>Arama verileri yüklenemedi.</p>
          <button type="button" onClick={() => {
            setFailed(false);
            setOpen(true);
            input.current?.focus();
          }}>Yeniden dene</button>
        </div>
      )}
      {expanded && (
        <ul id={`${id}-list`} role="listbox" className={styles.results}>
          {results.map((place, i) => (
            <li
              key={place.kod}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, so the pick lands before the input's blur closes the list
              onMouseDown={(e) => {
                e.preventDefault();
                pick(place);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span>{place.ad}</span>
              <span className={styles.muted}>{place.tur === "il" ? "il" : place.il}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
