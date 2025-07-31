import { useParams } from "react-router-dom";

export default function MatchPage() {
  const { id } = useParams();

  return (
    <div>
      <h2 className="text-xl font-bold mb-4 ">Detalji utakmice</h2>
      <p>
        Pregled utakmice s ID-em: <span className="font-mono">{id}</span>
      </p>
    </div>
  );
}
