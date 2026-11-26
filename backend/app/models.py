from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from .database import Base


def utc_now():
    return datetime.now(timezone.utc)


class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(60), unique=True, nullable=False, index=True)
    email = Column(String(120), unique=True, nullable=True, index=True)
    nombre = Column(String(120), nullable=False)
    primer_nombre = Column(String(60), nullable=False)
    iniciales = Column(String(4), nullable=False)
    password_hash = Column(String(256), nullable=False)
    # Roles: 'estudiante' | 'profesor' | 'admin_general'
    rol = Column(String(30), nullable=False, default="estudiante")
    activo = Column(Boolean, nullable=False, default=True)
    creado_por_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    creado_en = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class Curso(Base):
    __tablename__ = "cursos"

    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String(80), nullable=False)
    categoria = Column(String(50), nullable=False, default="Programación")
    nivel = Column(String(30), nullable=False, default="Principiante")
    descripcion = Column(String(300), nullable=False)
    color = Column(String(20), nullable=False, default="#2f6f73")
    # Acceso: 'gratis' | 'restringido'
    tipo_acceso = Column(String(20), nullable=False, default="gratis")
    precio = Column(Float, nullable=False, default=0.0)
    umbral_certificado = Column(Integer, nullable=False, default=70)
    prerequisito_curso_id = Column(Integer, ForeignKey("cursos.id", ondelete="SET NULL"), nullable=True)
    orden = Column(Integer, nullable=False, default=0)
    creado_por_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    creado_en = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    modulos = relationship(
        "Modulo",
        back_populates="curso",
        cascade="all, delete-orphan",
        order_by="Modulo.orden, Modulo.id",
    )


class Modulo(Base):
    __tablename__ = "modulos"

    id = Column(Integer, primary_key=True, index=True)
    curso_id = Column(Integer, ForeignKey("cursos.id", ondelete="CASCADE"), nullable=False, index=True)
    orden = Column(Integer, nullable=False, default=1)
    titulo = Column(String(120), nullable=False)

    curso = relationship("Curso", back_populates="modulos")
    lecciones = relationship(
        "Leccion",
        back_populates="modulo",
        cascade="all, delete-orphan",
        order_by="Leccion.orden, Leccion.id",
    )


class Leccion(Base):
    __tablename__ = "lecciones"

    id = Column(Integer, primary_key=True, index=True)
    modulo_id = Column(Integer, ForeignKey("modulos.id", ondelete="CASCADE"), nullable=False, index=True)
    orden = Column(Integer, nullable=False, default=1)
    titulo = Column(String(140), nullable=False)
    duracion = Column(Integer, nullable=False, default=60)
    video_url = Column(String(300), nullable=False, default="/videos/101.mp4")

    modulo = relationship("Modulo", back_populates="lecciones")
    preguntas = relationship(
        "Pregunta",
        back_populates="leccion",
        cascade="all, delete-orphan",
        order_by="Pregunta.segundo, Pregunta.id",
    )
    valoraciones = relationship(
        "ValoracionLeccion",
        back_populates="leccion",
        cascade="all, delete-orphan",
    )


class Pregunta(Base):
    __tablename__ = "preguntas"

    id = Column(Integer, primary_key=True, index=True)
    leccion_id = Column(Integer, ForeignKey("lecciones.id", ondelete="CASCADE"), nullable=False, index=True)
    segundo = Column(Integer, nullable=False, default=20)
    # Tipos: 'opcion_unica' | 'verdadero_falso' | 'multiple_respuesta' | 'completacion' | 'desarrollo'
    tipo = Column(String(30), nullable=False, default="opcion_unica")
    pregunta = Column(Text, nullable=False)
    # JSON serializado con opciones, correcta, correctas, respuestas_aceptadas, palabras_clave, min_palabras, explicacion
    config_json = Column(Text, nullable=False, default="{}")

    leccion = relationship("Leccion", back_populates="preguntas")


class InscripcionAcceso(Base):
    __tablename__ = "inscripciones_acceso"
    __table_args__ = (UniqueConstraint("usuario_id", "curso_id", name="uq_inscripcion_usuario_curso"),)

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    curso_id = Column(Integer, ForeignKey("cursos.id", ondelete="CASCADE"), nullable=False, index=True)
    # Estado: 'pendiente' | 'aprobado' | 'rechazado'
    estado = Column(String(20), nullable=False, default="pendiente")
    # Método: 'gratis' | 'solicitud_profesor' | 'pago_simulado' | 'admin'
    metodo = Column(String(30), nullable=False, default="solicitud_profesor")
    mensaje_solicitud = Column(Text, nullable=True)
    metodo_pago = Column(String(50), nullable=True)
    referencia_pago = Column(String(80), nullable=True)
    monto_pagado = Column(Float, nullable=True)
    aprobado_por_id = Column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    creado_en = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    actualizado_en = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class ProgresoUsuario(Base):
    __tablename__ = "progreso_usuario"

    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True)
    xp = Column(Integer, nullable=False, default=0)
    ultima_curso_id = Column(Integer, nullable=True)
    ultima_leccion_id = Column(Integer, nullable=True)
    racha_aciertos_actual = Column(Integer, nullable=False, default=0)
    mejor_racha_aciertos = Column(Integer, nullable=False, default=0)


class ProgresoLeccion(Base):
    __tablename__ = "progreso_lecciones"
    __table_args__ = (UniqueConstraint("usuario_id", "leccion_id", name="uq_progreso_usuario_leccion"),)

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    leccion_id = Column(Integer, ForeignKey("lecciones.id", ondelete="CASCADE"), nullable=False, index=True)
    maximo = Column(Integer, nullable=False, default=0)
    completada = Column(Boolean, nullable=False, default=False)
    completada_en = Column(DateTime(timezone=True), nullable=True)


class RespuestaUsuario(Base):
    __tablename__ = "respuestas_usuario"
    __table_args__ = (UniqueConstraint("usuario_id", "pregunta_id", name="uq_respuesta_usuario_pregunta"),)

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    pregunta_id = Column(Integer, ForeignKey("preguntas.id", ondelete="CASCADE"), nullable=False, index=True)
    leccion_id = Column(Integer, ForeignKey("lecciones.id", ondelete="CASCADE"), nullable=False, index=True)
    curso_id = Column(Integer, ForeignKey("cursos.id", ondelete="CASCADE"), nullable=False, index=True)
    intentos = Column(Integer, nullable=False, default=1)
    acertada_primer_intento = Column(Boolean, nullable=False, default=False)
    puntaje = Column(Float, nullable=False, default=0.0)
    respuesta_json = Column(Text, nullable=False, default="{}")
    respondida_en = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class ActividadDiaria(Base):
    __tablename__ = "actividad_diaria"
    __table_args__ = (UniqueConstraint("usuario_id", "fecha", name="uq_actividad_usuario_fecha"),)

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    # Formato ISO YYYY-MM-DD
    fecha = Column(String(10), nullable=False, index=True)


class LogroUsuario(Base):
    __tablename__ = "logros_usuario"
    __table_args__ = (UniqueConstraint("usuario_id", "logro_codigo", name="uq_logro_usuario_codigo"),)

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    logro_codigo = Column(String(50), nullable=False)
    desbloqueado_en = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class Certificado(Base):
    __tablename__ = "certificados"
    __table_args__ = (UniqueConstraint("usuario_id", "curso_id", name="uq_certificado_usuario_curso"),)

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(40), unique=True, nullable=False, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    curso_id = Column(Integer, ForeignKey("cursos.id", ondelete="CASCADE"), nullable=False, index=True)
    porcentaje_aciertos = Column(Integer, nullable=False)
    emitido_en = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class ValoracionLeccion(Base):
    __tablename__ = "valoraciones_leccion"
    __table_args__ = (UniqueConstraint("usuario_id", "leccion_id", name="uq_valoracion_usuario_leccion"),)

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    leccion_id = Column(Integer, ForeignKey("lecciones.id", ondelete="CASCADE"), nullable=False, index=True)
    puntuacion = Column(Integer, nullable=False)
    actualizado_en = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    leccion = relationship("Leccion", back_populates="valoraciones")
