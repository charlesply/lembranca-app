// PromoToast — toastzinho de prova social ("Criou uma música há X atrás"),
// só na landing. Aparece/some via classe .visible.
//
// Props:
//   - visible (bool): controla a class .visible
//   - data (object): { name, photo?, initials, time }
//     photo é opcional — fallback pras initials no avatar.
export default function PromoToast({ visible, data }) {
  if (!data) return null
  return (
    <div className="toast-wrap">
      <div className={`toast${visible ? ' visible' : ''}`}>
        <div className="toast-avatar">
          {data.photo ? <img src={data.photo} alt="" loading="lazy" /> : data.initials}
        </div>
        <div>
          <div className="toast-title">{data.name}</div>
          <div className="toast-subtitle">Criou uma música há {data.time} atrás</div>
        </div>
      </div>
    </div>
  )
}
