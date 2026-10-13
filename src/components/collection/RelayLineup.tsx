import { relayMemberName, type Race } from "./times-data";
import s from "./RelayLineup.module.css";

export default function RelayLineup({ race }: { race: Race }) {
  return (
    <ul className={s.lineup} aria-label="Relay swimmers">
      {[1, 2, 3, 4].map((leg) => {
        const member = race.members?.find((member) => member.leg === leg);
        return (
          <li key={leg} title={member?.name || `Leg ${leg} unreported`}>
            {relayMemberName(member?.name || "")}
          </li>
        );
      })}
    </ul>
  );
}
