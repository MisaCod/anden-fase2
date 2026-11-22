from typing import Any, Optional
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=40)
    nombre: str = Field(..., min_length=2, max_length=100)
    email: Optional[str] = None
    password: str = Field(..., min_length=4, max_length=100)


class CrearUsuarioAdminRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=40)
    nombre: str = Field(..., min_length=2, max_length=100)
    email: Optional[str] = None
    password: str = Field(..., min_length=4, max_length=100)
    rol: str = Field(..., pattern="^(estudiante|profesor|admin_general)$")


class ActualizarUsuarioAdminRequest(BaseModel):
    activo: Optional[bool] = None
    rol: Optional[str] = Field(default=None, pattern="^(estudiante|profesor|admin_general)$")


class PreguntaInput(BaseModel):
    id: Optional[int] = None
    segundo: int = Field(..., ge=0)
    tipo: str = Field(
        default="opcion_unica",
        pattern="^(opcion_unica|verdadero_falso|multiple_respuesta|completacion|desarrollo)$",
    )
    pregunta: str = Field(..., min_length=3)
    opciones: Optional[list[str]] = None
    correcta: Optional[int] = None
    correctas: Optional[list[int]] = None
    respuestasAceptadas: Optional[list[str]] = None
    palabrasClave: Optional[list[str]] = None
    minPalabras: Optional[int] = 8
    pista: Optional[str] = ""
    explicacion: Optional[str] = ""


class LeccionInput(BaseModel):
    id: Optional[int] = None
    titulo: str = Field(..., min_length=1, max_length=140)
    duracion: int = Field(default=60, ge=5)
    video: str = "/videos/101.mp4"
    cuestionarios: list[PreguntaInput] = Field(default_factory=list)


class ModuloInput(BaseModel):
    id: Optional[int] = None
    titulo: str = Field(..., min_length=1, max_length=120)
    lecciones: list[LeccionInput] = Field(default_factory=list)


class CursoCreateUpdate(BaseModel):
    titulo: str = Field(..., min_length=2, max_length=80)
    categoria: str = Field(default="Programación", min_length=2, max_length=50)
    nivel: str = Field(default="Principiante", min_length=2, max_length=30)
    descripcion: str = Field(..., min_length=3, max_length=300)
    color: str = Field(default="#2f6f73", max_length=20)
    tipoAcceso: str = Field(default="gratis", pattern="^(gratis|restringido)$")
    precio: float = Field(default=0.0, ge=0.0)
    umbralCertificado: int = Field(default=70, ge=10, le=100)
    prerequisitoCursoId: Optional[int] = None
    modulos: list[ModuloInput] = Field(default_factory=list)


class ActualizarVideoLeccionRequest(BaseModel):
    video: Optional[str] = None
    duracion: Optional[int] = Field(default=None, ge=5)
    cuestionarios: list[PreguntaInput] = Field(default_factory=list)


class CrearLeccionConVideoRequest(BaseModel):
    moduloId: Optional[int] = None
    titulo: str = Field(..., min_length=2, max_length=140)
    duracion: int = Field(default=60, ge=5)
    video: str = "/videos/101.mp4"
    cuestionarios: list[PreguntaInput] = Field(default_factory=list)


class GuardarAvanceRequest(BaseModel):
    cursoId: int
    leccionId: int
    segundo: int = Field(..., ge=0)


class ResponderPreguntaRequest(BaseModel):
    preguntaId: int
    respuesta: Any
    intento: int = Field(default=1, ge=1)
    modoRepaso: bool = False


class CompletarLeccionRequest(BaseModel):
    cursoId: int
    leccionId: int


class SolicitarAccesoRequest(BaseModel):
    mensaje: str = Field(default="Solicito acceso al curso para continuar mi formación.", max_length=400)


class PagoSimuladoRequest(BaseModel):
    metodoPago: str = Field(default="Tarjeta demo", max_length=50)
    titular: str = Field(default="Estudiante", max_length=80)


class ResolverSolicitudRequest(BaseModel):
    estado: str = Field(..., pattern="^(aprobado|rechazado)$")


class OtorgarAccesoManualRequest(BaseModel):
    usuarioId: int
    cursoId: int
    estado: str = Field(default="aprobado", pattern="^(aprobado|rechazado)$")
