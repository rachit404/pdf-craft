"""What a flow is, and the checks that run before one is executed.

A flow is a graph. `source` nodes bring in files, operation nodes (from the
registry) transform them, and `output` nodes mark what to keep. Files travel
along the edges as lists ("items"), so a step can run once per file or once for
all of them.
"""

from typing import Any

from pydantic import BaseModel, Field, ValidationError

from app import registry

SOURCE = "source"
OUTPUT = "output"

MAX_NODES = 25
MAX_EDGES = 60

NODE_ID = r"^[A-Za-z0-9_-]{1,40}$"

# Settings whose values must never be stored or logged.
SECRET_SETTINGS = {"user_password", "owner_password", "password"}


class FlowNode(BaseModel):
    id: str = Field(pattern=NODE_ID)
    op: str  # "source", "output" or a registry operation id
    params: dict[str, Any] = Field(default_factory=dict)
    label: str | None = Field(default=None, max_length=80)


class FlowEdge(BaseModel):
    source: str
    target: str
    # Which input of the target receives the files; default: its first input.
    port: str | None = None


class FlowDefinition(BaseModel):
    nodes: list[FlowNode] = Field(min_length=1, max_length=MAX_NODES)
    edges: list[FlowEdge] = Field(default_factory=list, max_length=MAX_EDGES)


class Issue(BaseModel):
    node: str | None = None
    message: str


def masked(definition: FlowDefinition) -> dict:
    """The definition as stored: passwords replaced by asterisks."""
    data = definition.model_dump()

    for node in data["nodes"]:
        for key in SECRET_SETTINGS & node["params"].keys():
            if node["params"][key]:
                node["params"][key] = "***"

    return data


def port_for(edge: FlowEdge, target_op: registry.Operation | None) -> str | None:
    if target_op is None:
        return None

    return edge.port or target_op.inputs[0].name


def topological_order(definition: FlowDefinition) -> list[str] | None:
    """Node ids in run order, or None when the graph has a cycle."""
    incoming = {node.id: 0 for node in definition.nodes}

    for edge in definition.edges:
        if edge.target in incoming:
            incoming[edge.target] += 1

    ready = [node.id for node in definition.nodes if incoming[node.id] == 0]
    order: list[str] = []

    while ready:
        current = ready.pop(0)
        order.append(current)

        for edge in definition.edges:
            if edge.source == current and edge.target in incoming:
                incoming[edge.target] -= 1

                if incoming[edge.target] == 0:
                    ready.append(edge.target)

    return order if len(order) == len(definition.nodes) else None


def validate(definition: FlowDefinition) -> list[Issue]:
    """Everything that can be checked without running the flow."""
    issues: list[Issue] = []
    nodes = {}

    for node in definition.nodes:
        if node.id in nodes:
            issues.append(Issue(node=node.id, message="Two steps share the same id."))
        nodes[node.id] = node

    ops: dict[str, registry.Operation | None] = {}

    for node in nodes.values():
        if node.op in (SOURCE, OUTPUT):
            ops[node.id] = None
            continue

        operation = registry.get(node.op)
        ops[node.id] = operation

        if operation is None:
            issues.append(Issue(node=node.id, message=f"Unknown step: {node.op}."))
            continue

        try:
            operation.params.model_validate(node.params)
        except ValidationError as error:
            first = error.errors()[0]
            where = ".".join(str(part) for part in first["loc"]) or "settings"
            issues.append(Issue(node=node.id, message=f"{operation.label}: {where}: {first['msg']}"))

    connected: dict[str, set[str]] = {node_id: set() for node_id in nodes}

    for edge in definition.edges:
        source, target = nodes.get(edge.source), nodes.get(edge.target)

        if source is None or target is None:
            issues.append(Issue(message="A connection points at a step that does not exist."))
            continue

        if source.op == OUTPUT:
            issues.append(Issue(node=source.id, message="Nothing can follow a result step."))
        if target.op == SOURCE:
            issues.append(Issue(node=target.id, message="A source step cannot receive files."))

        target_op = ops[target.id]
        if target_op is None:
            connected[target.id].add("*")
            continue

        port_name = port_for(edge, target_op)
        port = next((p for p in target_op.inputs if p.name == port_name), None)

        if port is None:
            issues.append(Issue(node=target.id, message=f"{target_op.label} has no input called {port_name!r}."))
            continue

        connected[target.id].add(port.name)
        producer = ops[source.id]

        if producer is not None and producer.output != port.kind:
            issues.append(
                Issue(
                    node=target.id,
                    message=f"{target_op.label} needs {port.kind} files but {producer.label} produces {producer.output} files.",
                )
            )

    for node in nodes.values():
        operation = ops[node.id]

        if operation is not None:
            for port in operation.inputs:
                if port.name not in connected[node.id]:
                    issues.append(Issue(node=node.id, message=f"{operation.label} needs something connected to its {port.label or port.name} input."))
        elif node.op == OUTPUT and not connected[node.id]:
            issues.append(Issue(node=node.id, message="A result step needs an incoming connection."))

    if topological_order(definition) is None:
        issues.append(Issue(message="The steps form a loop; a flow must run in one direction."))

    if not any(node.op == SOURCE for node in nodes.values()):
        issues.append(Issue(message="A flow needs at least one source step."))

    return issues
