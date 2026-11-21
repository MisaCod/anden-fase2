function BarraProgreso({ porcentaje }) {
  return (
    <div className="barra">
      <div className="barra-relleno" style={{ width: porcentaje + '%' }}></div>
    </div>
  )
}

export default BarraProgreso
